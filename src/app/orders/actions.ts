"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { checkCriterion, parseCriteriaLines } from "@/lib/rules";
import { draftCriteria, type DraftedCriterion } from "@/lib/ai";
import { errorCode, type ErrorCode } from "@/lib/errors";

const NewOrder = z.object({
  title: z.string().trim().min(3).max(140),
  client_email: z.string().trim().toLowerCase().email(),
  due_date: z.string().optional().transform((v) => (v ? v : null)),
  criteria: z.string().min(1),
});

export type FormState = { error?: string; issues?: { line: number; message: string }[] };

export async function createOrder(_: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login");
  const parsed = NewOrder.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Check the title, client email and criteria." };
  const rows = parseCriteriaLines(parsed.data.criteria);
  const issues = rows.flatMap((r, i) => checkCriterion(r.criterion, r.how_checked).map((x) => ({ line: i + 1, message: x.message })));
  if (!rows.length) return { error: "Add at least one criterion." };
  if (issues.length) return { error: "Some criteria aren't checkable yet.", issues };

  const { data: order, error } = await supabase
    .from("orders")
    .insert({ title: parsed.data.title, client_email: parsed.data.client_email, due_date: parsed.data.due_date })
    .select("id")
    .single();
  if (error || !order) return { error: "Could not create the order. Try again." };
  const { error: cErr } = await supabase
    .from("criteria")
    .insert(rows.map((r, i) => ({ order_id: order.id, position: i + 1, criterion: r.criterion, how_checked: r.how_checked })));
  if (cErr) {
    // Don't leave an empty draft behind: it is still a draft, so the owner may delete it.
    await supabase.from("orders").delete().eq("id", order.id);
    return { error: "The criteria couldn't be saved, so the order wasn't created. Try again." };
  }
  redirect(`/orders/${order.id}`);
}

export async function draftWithAI(scope: string): Promise<{ items?: DraftedCriterion[]; error?: string }> {
  const { user } = await currentUser();
  if (!user) return { error: "Sign in first." };
  if (scope.trim().length < 20) return { error: "Describe the order in a sentence or two first." };
  if (!process.env.ANTHROPIC_API_KEY) return { error: "AI drafting is not configured." };
  // Paid model call: counted in the database first (20 per user per day).
  const { supabase } = await currentUser();
  const { data: allowed, error: capErr } = await supabase.rpc("take_ai_draft");
  if (capErr) return { error: "AI drafting is unavailable right now." };
  if (!allowed) return { error: "You've used today's 20 AI drafts. Try again tomorrow, or write the criteria yourself." };
  try {
    return { items: await draftCriteria(scope) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function fail(path: string, code: ErrorCode): never {
  redirect(`${path}?error=${code}`);
}

async function rpc(fn: string, args: Record<string, unknown>, path: string) {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc(fn, args);
  revalidatePath(path);
  if (error) fail(path, errorCode(error.message));
}

export async function sendOrder(id: string) { await rpc("send_order", { p_order: id }, `/orders/${id}`); }
export async function acceptOrder(id: string) { await rpc("accept_order", { p_order: id }, `/orders/${id}`); }
export async function deliverOrder(id: string) { await rpc("deliver_order", { p_order: id }, `/orders/${id}`); }
export async function signOff(id: string) { await rpc("sign_off", { p_order: id }, `/orders/${id}`); }

export async function flagCriterion(orderId: string, criterionId: string, formData: FormData) {
  await rpc("flag_criterion", { p_criterion: criterionId, p_note: String(formData.get("note") || "") }, `/orders/${orderId}`);
}

export async function markMet(orderId: string, criterionId: string, formData: FormData) {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login");
  const evidence = String(formData.get("evidence") || "").trim();
  const path = `/orders/${orderId}`;
  if (!evidence) fail(path, "need_evidence");
  const { data, error } = await supabase.from("criteria").update({ met: true, evidence: evidence.slice(0, 1000) }).eq("id", criterionId).eq("order_id", orderId).select("id");
  revalidatePath(path);
  if (error) fail(path, errorCode(error.message));
  if (!data?.length) fail(path, "not_saved");
}
