import { describe, expect, test } from "bun:test";
import { calculate } from "../src/calculator.ts";

const result = (expression: string) => calculate(expression)?.result ?? null;

describe("calculate", () => {
  test.each([
    ["1+2", "3"],
    ["2 + 3 * 4", "14"],
    ["(2 + 3) * 4", "20"],
    ["2^10", "1,024"],
    ["2**3", "8"],
    ["-3 + 5", "2"],
    ["10 / 4", "2.5"],
    ["0.1 + 0.2", "0.3"],
    ["1,000 * 3", "3,000"],
    ["3 x 4", "12"],
    ["6 ÷ 3", "2"],
    ["5!", "120"],
    ["sqrt(16)", "4"],
    ["2pi", "6.2831853072"],
    ["2(3+4)", "14"],
    ["pi", "3.1415926536"],
  ])("%s = %s", (expression, expected) => {
    expect(result(expression)).toBe(expected);
  });

  test("percent follows Soulver semantics", () => {
    expect(result("200 + 10%")).toBe("220");
    expect(result("200 - 25%")).toBe("150");
    expect(result("10% * 50")).toBe("5");
    expect(result("50%")).toBe("0.5");
  });

  test("ignores input that is not a calculation", () => {
    for (const input of ["", "42", "safari", "1 +", "x", "foo(2)", "3 4 5 +"]) expect(calculate(input)).toBeNull();
  });

  test("rejects non-finite results", () => {
    expect(calculate("1/0")).toBeNull();
  });

  test("raw value has no grouping, for copy and paste", () => {
    expect(calculate("1000 * 1000")).toEqual({ expression: "1000 * 1000", result: "1,000,000", raw: "1000000" });
  });
});
