import { describe, expect, it } from "vitest";
import { formatSlPhone, maskPhone, normalizeSlPhone, operatorFromPhone, phoneSL } from "../phone";

describe("normalizeSlPhone", () => {
  it.each([
    ["076 123456", "+23276123456"],
    ["076123456", "+23276123456"],
    ["76123456", "+23276123456"],
    ["+232 76 123456", "+23276123456"],
    ["23276123456", "+23276123456"],
    ["0023276123456", "+23276123456"],
    ["030-123-456", "+23230123456"],
    ["(088) 123 456", "+23288123456"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeSlPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "0761234567", "+44 7700 900123", "01234567", "abcdefgh"])(
    "rejects %s",
    (input) => {
      expect(normalizeSlPhone(input)).toBeNull();
    },
  );
});

describe("phoneSL schema", () => {
  it("parses and normalises", () => {
    expect(phoneSL.parse("076 123456")).toBe("+23276123456");
  });
  it("returns a friendly error", () => {
    const r = phoneSL.safeParse("123");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/valid Sierra Leone/);
  });
});

describe("helpers", () => {
  it("formats for display", () => {
    expect(formatSlPhone("+23276123456")).toBe("076 123 456");
  });
  it("masks", () => {
    expect(maskPhone("+23276123456")).toBe("+23276***456");
  });
  it("detects operators best-effort", () => {
    expect(operatorFromPhone("+23276123456")).toBe("ORANGE");
    expect(operatorFromPhone("+23277123456")).toBe("AFRICELL");
    expect(operatorFromPhone("+23231123456")).toBe("QCELL");
    expect(operatorFromPhone("+23225123456")).toBe("UNKNOWN");
  });
});
