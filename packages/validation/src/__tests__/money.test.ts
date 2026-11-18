import { describe, expect, it } from "vitest";
import { formatLe, moneyLe, roundMoney, sumMoney, toDecimal } from "../money";

describe("money", () => {
  it("avoids floating point errors", () => {
    expect(sumMoney(["0.1", "0.2"]).toString()).toBe("0.3");
    expect(sumMoney([0.1, 0.2]).equals(toDecimal("0.3"))).toBe(true);
  });

  it("rounds half up to 2dp", () => {
    expect(roundMoney("1.005").toFixed(2)).toBe("1.01");
    expect(roundMoney("1.004").toFixed(2)).toBe("1.00");
  });

  it.each([
    ["4000", "Le 4,000"],
    ["4000.5", "Le 4,000.50"],
    ["1234567.891", "Le 1,234,567.89"],
    ["0", "Le 0"],
    ["-250", "-Le 250"],
  ])("formatLe(%s) = %s", (input, expected) => {
    expect(formatLe(input)).toBe(expected);
  });

  it("parses user input", () => {
    expect(moneyLe.parse("4,000")).toBe("4000.00");
    expect(moneyLe.parse("Le 250.5")).toBe("250.50");
    expect(moneyLe.parse(12)).toBe("12.00");
    expect(moneyLe.safeParse("-5").success).toBe(false);
    expect(moneyLe.safeParse("abc").success).toBe(false);
  });
});
