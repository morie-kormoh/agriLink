import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import kri from "../../messages/kri.json";
import { getMessages, t } from "../index";

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    if (k.startsWith("_")) return [];
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === "object" ? keys(v as Record<string, unknown>, path) : [path];
  });
}

describe("i18n", () => {
  it("formats ICU variables", () => {
    expect(t("en", "auth.codeSubtitle", { phone: "076 123 456" })).toBe(
      "We sent a 6-digit code to 076 123 456.",
    );
    expect(t("en", "sync.pendingCount", { count: 1 })).toBe("1 record waiting");
    expect(t("en", "sync.pendingCount", { count: 3 })).toBe("3 records waiting");
  });

  it("uses Krio where translated and falls back to English otherwise", () => {
    expect(t("kri", "auth.sendCode")).toBe("Sɛn di kod");
    // Every key now has Krio; an unknown key still falls back to the key itself.
    expect(t("kri", "auth.devHint")).not.toBe(t("en", "auth.devHint"));
    expect(t("kri", "no.such.key")).toBe("no.such.key");
  });

  it("returns the key for unknown messages and unknown locales fall back to English", () => {
    expect(t("en", "nope.missing")).toBe("nope.missing");
    expect(t("fr", "common.save")).toBe("Save");
  });

  it("Krio has no keys that English lacks", () => {
    const enKeys = new Set(keys(en));
    const extra = keys(kri).filter((k) => !enKeys.has(k));
    expect(extra).toEqual([]);
  });

  it("merged Krio catalog has every English key", () => {
    expect(keys(getMessages("kri")).sort()).toEqual(keys(en).sort());
  });
});
