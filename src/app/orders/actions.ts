"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/supabase/server";
import { checkCriterion, parseCriteriaLines } from "@/lib/rules";
import { draftCriteria, type DraftedCriterion } from "@/lib/ai";

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
  if (error || !order) return { error: error?.message ?? "Could not create the order." };
  const { error: cErr } = await supabase
    .from("criteria")
    .insert(rows.map((r, i) => ({ order_id: order.id, position: i + 1, criterion: r.criterion, how_checked: r.how_checked })));
  if (cErr) return { error: cErr.message };
  redirect(`/orders/${order.id}`);
}

export async function draftWithAI(scope: string): Promise<{ items?: DraftedCriterion[]; error?: string }> {
  const { user } = await currentUser();
  if (!user) return { error: "Sign in first." };
  if (scope.trim().length < 20) return { error: "Describe the order in a sentence or two first." };
  try {
    return { items: await draftCriteria(scope) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function rpc(fn: string, args: Record<string, unknown>, path: string) {
  const { supabase, user } = await currentUser();
  if (!user) redirect("/login");
  const { error } = await supabase.rpc(fn, args);
  revalidatePath(path);
  if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);
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
  if (!evidence) redirect(`${path}?error=${encodeURIComponent("Add the evidence for this criterion.")}`);
  const { error } = await supabase.from("criteria").update({ met: true, evidence }).eq("id", criterionId);
  revalidatePath(path);
  if (error) redirect(`${path}?error=${encodeURIComponent(error.message)}`);
}
