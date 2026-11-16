import "server-only";
import { z } from "zod";
import { checkCriterion, type Issue } from "./rules";

const Draft = z.array(z.object({ criterion: z.string().min(1).max(400), how_checked: z.string().min(1).max(300) })).max(15);
export type DraftedCriterion = { criterion: string; how_checked: string; issues: Issue[] };

// One model call suggests criteria; the deterministic rules then check every suggestion.
// The AI never writes to the database: the owner edits and saves.
export async function draftCriteria(scope: string): Promise<DraftedCriterion[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("AI drafting is not configured.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 1200,
      system:
        "You write acceptance criteria for freelance orders. Each criterion must be checkable by a third party: a count, a yes/no, a file that exists, a test result, a duration. Never use taste words (professional, high quality, clean, modern, nice). Reply with JSON only: an array of {\"criterion\": string, \"how_checked\": string}, 3 to 8 items.",
      messages: [{ role: "user", content: `Order scope:\n${scope.slice(0, 4000)}` }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`AI drafting failed (${res.status}).`);
  const body = await res.json();
  const text: string = body?.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
  const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  let raw: unknown = [];
  try {
    raw = JSON.parse(json || "[]");
  } catch {
    throw new Error("AI reply was not in the expected format.");
  }
  const parsed = Draft.safeParse(raw);
  if (!parsed.success) throw new Error("AI reply was not in the expected format.");
  return parsed.data.map((d) => ({ ...d, issues: checkCriterion(d.criterion, d.how_checked) }));
}
