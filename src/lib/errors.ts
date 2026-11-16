// Errors travel in the URL as short codes, never as text, so a crafted link can't put its own words on our page.
export const ERROR_TEXT = {
  not_yours: "That order isn't yours to change.",
  no_criteria: "Add at least one criterion before sending.",
  not_all_met: "Every criterion needs to be marked met, with evidence, before delivery.",
  say_what: "Say what isn't met (at least a few words).",
  wrong_state: "That step isn't available at this stage of the order.",
  not_in_progress: "Evidence can be recorded only while the work is in progress.",
  need_evidence: "Add the evidence for this criterion.",
  not_saved: "That change wasn't saved. Refresh the page and try again.",
  link: "That sign-in link didn't work. It may have expired; request a new one.",
  send: "We couldn't send the sign-in link. Check the address and try again in a minute.",
  generic: "Something went wrong. Refresh the page and try again.",
} as const;

export type ErrorCode = keyof typeof ERROR_TEXT;

// Database messages we raise on purpose (supabase/migrations) mapped to a code. Anything else is "generic".
const DB_MESSAGES: [RegExp, ErrorCode][] = [
  [/not your order/, "not_yours"],
  [/add at least one criterion/, "no_criteria"],
  [/every criterion needs to be met/, "not_all_met"],
  [/say what is not met/, "say_what"],
  [/^not allowed:/, "wrong_state"],
  [/only while the work is in progress/, "not_in_progress"],
];

export function errorCode(message: string | undefined | null): ErrorCode {
  const m = message ?? "";
  return DB_MESSAGES.find(([re]) => re.test(m))?.[1] ?? "generic";
}

export function errorText(code: string | undefined): string | undefined {
  return code && Object.hasOwn(ERROR_TEXT, code) ? ERROR_TEXT[code as ErrorCode] : undefined;
}
