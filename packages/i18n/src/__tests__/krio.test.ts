import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import kri from "../../messages/kri.json";
import { translateSms } from "../sms";
import { translateText } from "../text";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    k.startsWith("_")
      ? []
      : v && typeof v === "object"
        ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
        : [`${prefix}${k}`],
  );
}

describe("Krio", () => {
  it("has a translation for every English message", () => {
    const k = new Set(keys(kri));
    expect(keys(en).filter((key) => !k.has(key))).toEqual([]);
  });

  it("translates server and validation messages", () => {
    expect(translateText("kri", "Enter your 4–5 digit PIN")).toBe("Put yu 4–5 nɔmba PIN");
    expect(translateText("kri", "Wrong PIN. 2 attempt(s) left.")).toBe("Rɔng PIN. 2 tray lɛf.");
    expect(translateText("en", "Enter your 4–5 digit PIN")).toBe("Enter your 4–5 digit PIN");
    expect(translateText("kri", "A message we have not translated")).toBe(
      "A message we have not translated",
    );
  });

  it("translates SMS and keeps names, amounts and refs", () => {
    const sms =
      "AgriLink: Bombali Co-op paid Le 4,000 for 1000kg Rice. Savings Le 600, Co-op dues Le 80, You Le 3,320. Ref PAY-000059";
    expect(translateSms("kri", sms)).toBe(
      "AgriLink: Bombali Co-op pe Le 4,000 fɔ 1000kg Rice. Sev Le 600, Ko-op dyuz Le 80, Yu Le 3,320. Ref PAY-000059",
    );
    expect(translateSms("en", sms)).toBe(sms);
  });
});
