import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-path";
import { errorCode, errorText } from "./errors";

describe("safeNext: after sign-in, stay on this site", () => {
  it("keeps paths on this site", () => {
    expect(safeNext("/orders/abc")).toBe("/orders/abc");
    expect(safeNext("/orders?x=1")).toBe("/orders?x=1");
  });
  it("refuses anything that leaves the site", () => {
    for (const bad of ["//evil.example", "/\\evil.example", "/\\/evil.example", "https://evil.example", "evil.example", "javascript:alert(1)"]) {
      expect(safeNext(bad), bad).toBe("/orders");
    }
  });
  it("falls back when empty", () => {
    expect(safeNext(null)).toBe("/orders");
    expect(safeNext("")).toBe("/orders");
  });
});

describe("error codes: no free text from the URL", () => {
  it("maps the database messages we raise", () => {
    expect(errorCode("every criterion needs to be met, with evidence")).toBe("not_all_met");
    expect(errorCode("not allowed: delivered while the order is sent")).toBe("wrong_state");
    expect(errorCode("evidence can be recorded only while the work is in progress")).toBe("not_in_progress");
  });
  it("anything unexpected is generic", () => {
    expect(errorCode('duplicate key value violates unique constraint "x"')).toBe("generic");
    expect(errorCode(undefined)).toBe("generic");
  });
  it("only known codes are shown", () => {
    expect(errorText("not_all_met")).toMatch(/Every criterion/);
    expect(errorText("Your account is suspended, call 555-0100")).toBeUndefined();
    expect(errorText("toString")).toBeUndefined();
    expect(errorText(undefined)).toBeUndefined();
  });
});
