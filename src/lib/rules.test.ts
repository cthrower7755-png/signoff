import { describe, expect, it } from "vitest";
import { canDeliver, checkCriterion, parseCriteriaLines } from "./rules";

describe("checkCriterion", () => {
  it("accepts a countable, checkable criterion", () => {
    expect(checkCriterion("Every database table is listed with its access rule", "Count in report matches the project")).toEqual([]);
  });
  it("rejects taste words", () => {
    const issues = checkCriterion("The report is professional and high quality", "Client reads it");
    expect(issues.map((i) => i.code)).toContain("vague");
  });
  it("rejects criteria with nothing verifiable", () => {
    expect(checkCriterion("The design should feel right", "Look at it").map((i) => i.code)).toContain("not_checkable");
  });
  it("requires how it is checked", () => {
    expect(checkCriterion("Video is 60 seconds long", "").map((i) => i.code)).toContain("no_check");
  });
  it("does not flag words that only contain a vague word", () => {
    // "goods" contains "good"; "fastener" contains "fast"
    expect(checkCriterion("All 12 goods receipts are listed, including fastener orders", "Row count = 12")).toEqual([]);
  });
  it("is deterministic", () => {
    const a = checkCriterion("Make it nicer", "eyeball");
    const b = checkCriterion("Make it nicer", "eyeball");
    expect(a).toEqual(b);
  });
});

describe("parseCriteriaLines", () => {
  it("splits criterion and how-checked on the first pipe", () => {
    expect(parseCriteriaLines("Every key listed | search of repo | and build\n\n  PDF delivered by Friday | file exists ")).toEqual([
      { criterion: "Every key listed", how_checked: "search of repo | and build" },
      { criterion: "PDF delivered by Friday", how_checked: "file exists" },
    ]);
  });
});

describe("canDeliver", () => {
  it("needs every criterion met with evidence", () => {
    expect(canDeliver([])).toBe(false);
    expect(canDeliver([{ met: true, evidence: "link" }, { met: true, evidence: " " }])).toBe(false);
    expect(canDeliver([{ met: true, evidence: "link" }])).toBe(true);
  });
});
