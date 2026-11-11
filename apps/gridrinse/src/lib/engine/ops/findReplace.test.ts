import { describe, expect, it } from "vitest";
import { checkRegexSafety, findReplace, type FindReplaceOptions } from "./findReplace";

const t = {
  columns: ["status", "note"],
  rows: [
    ["shipped", "Ship by Friday"],
    ["SHIPPED", "n/a"],
    ["Shipped late", "$5 fee"],
  ],
};
const opts = (o: Partial<FindReplaceOptions>): FindReplaceOptions => ({
  find: "",
  replace: "",
  regex: false,
  caseSensitive: false,
  wholeCell: false,
  columns: [],
  ...o,
});

describe("findReplace", () => {
  it("replaces literal text case-insensitively everywhere", () => {
    const r = findReplace(t, opts({ find: "ship", replace: "send" }));
    expect(r.table.rows.map((x) => x[0])).toEqual(["sendped", "sendPED", "sendped late"]);
    expect(r.table.rows[0]![1]).toBe("send by Friday");
  });

  it("respects case sensitivity and whole-cell matching", () => {
    const r = findReplace(t, opts({ find: "shipped", replace: "Shipped", wholeCell: true, columns: ["status"] }));
    expect(r.table.rows.map((x) => x[0])).toEqual(["Shipped", "Shipped", "Shipped late"]);
    const cs = findReplace(t, opts({ find: "shipped", replace: "X", caseSensitive: true, wholeCell: true }));
    expect(cs.table.rows.map((x) => x[0])).toEqual(["X", "SHIPPED", "Shipped late"]);
  });

  it("treats $ literally in literal mode and as group refs in regex mode", () => {
    const lit = findReplace(t, opts({ find: "$5", replace: "$1.00", columns: ["note"] }));
    expect(lit.table.rows[2]![1]).toBe("$1.00 fee");
    const rx = findReplace(t, opts({ find: "(\\w+) by (\\w+)", replace: "$2: $1", regex: true }));
    expect(rx.table.rows[0]![1]).toBe("Friday: Ship");
  });

  it("can blank out placeholder values with a whole-cell regex", () => {
    const r = findReplace(t, opts({ find: "n/?a|none|-", replace: "", regex: true, wholeCell: true }));
    expect(r.table.rows[1]![1]).toBe("");
    expect(r.report.cellsChanged).toBe(1);
  });

  it("throws helpful errors for empty, invalid or dangerous patterns", () => {
    expect(() => findReplace(t, opts({ find: "" }))).toThrow(/Enter text/);
    expect(() => findReplace(t, opts({ find: "(", regex: true }))).toThrow(/Invalid pattern/);
    expect(() => findReplace(t, opts({ find: "(a+)+$", regex: true }))).toThrow(/freeze/);
  });
});

describe("checkRegexSafety", () => {
  it("flags nested quantifiers and long patterns", () => {
    expect(checkRegexSafety("(a+)+")).not.toBeNull();
    expect(checkRegexSafety("(\\w*)*")).not.toBeNull();
    expect(checkRegexSafety("((ab)+c)*")).not.toBeNull();
    expect(checkRegexSafety("(x+|y)+")).not.toBeNull();
    expect(checkRegexSafety("(a)\\1+")).not.toBeNull();
    expect(checkRegexSafety("x".repeat(400))).not.toBeNull();
  });
  it("allows ordinary patterns", () => {
    expect(checkRegexSafety("^\\d{3}-\\d{4}$")).toBeNull();
    expect(checkRegexSafety("(Mr|Mrs|Ms)\\.? ")).toBeNull();
    expect(checkRegexSafety("[a+]+")).toBeNull();
    expect(checkRegexSafety("(\\d+)-(\\d+)")).toBeNull();
  });
});
