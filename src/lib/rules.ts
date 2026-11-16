// Deterministic rules shared by the UI, the server actions and the AI draft step.
// The AI can suggest criteria; these rules decide whether a criterion is checkable.

export type Status = "draft" | "sent" | "accepted" | "delivered" | "changes_requested" | "signed_off";

export const STATUS_LABEL: Record<Status, string> = {
  draft: "Draft",
  sent: "Waiting for client to accept",
  accepted: "Accepted — work in progress",
  delivered: "Delivered — waiting for sign-off",
  changes_requested: "Client flagged a criterion",
  signed_off: "Signed off",
};

// Words that describe taste, not a check a third party could make.
const VAGUE = [
  "high quality", "high-quality", "professional", "nice", "good", "great", "better", "best", "clean",
  "robust", "modern", "intuitive", "user-friendly", "user friendly", "seamless", "polished", "beautiful",
  "fast", "as needed", "etc", "appropriate", "properly", "adequate",
];

// A criterion must contain something countable or verifiable.
const CHECKABLE = /\d|every|each|all |no |none|zero|listed|exists|returns|passes|fails|matches|within|under|over|at least|at most|signed|approved|delivered|file|pdf|link|screenshot|test|log/i;

export type Issue = { code: "too_short" | "too_long" | "vague" | "not_checkable" | "no_check"; message: string };

export function checkCriterion(criterion: string, howChecked: string): Issue[] {
  const c = criterion.trim();
  const h = howChecked.trim();
  const issues: Issue[] = [];
  if (c.length < 5) issues.push({ code: "too_short", message: "Write the criterion as a full sentence." });
  if (c.length > 400) issues.push({ code: "too_long", message: "Keep a criterion under 400 characters; split it." });
  const lower = ` ${c.toLowerCase()} `;
  const hits = VAGUE.filter((w) => new RegExp(`[^a-z]${w.replace(/[-]/g, "\\-")}[^a-z]`).test(lower));
  if (hits.length) {
    const named = hits.map((w) => `"${w}"`);
    const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
    const verb = named.length === 1 ? "is a matter" : "are matters";
    issues.push({ code: "vague", message: `${list} ${verb} of taste. Say what a third party could check instead.` });
  }
  if (!CHECKABLE.test(c)) issues.push({ code: "not_checkable", message: "Add something countable or verifiable (a number, 'every', a file, a test)." });
  if (h.length < 3) issues.push({ code: "no_check", message: "Say how it will be checked." });
  return issues;
}

export function parseCriteriaLines(text: string): { criterion: string; how_checked: string }[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [criterion, ...rest] = l.split("|");
      return { criterion: criterion.trim(), how_checked: rest.join("|").trim() };
    });
}

export function canDeliver(criteria: { met: boolean; evidence: string | null }[]): boolean {
  return criteria.length > 0 && criteria.every((c) => c.met && !!c.evidence?.trim());
}
