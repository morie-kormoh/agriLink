import { describe, expect, it } from "vitest";
import { csvFarmerRowSchema, registerFarmerSchema } from "../farmer";
import { currentSeason, isYouth } from "../common";

const valid = {
  clientRef: "7d0f5a0e-3c1b-4f7a-9a51-2b7f0f6c1e11",
  consentToRegister: true,
  fullName: "  Aminata   Sesay ",
  gender: "FEMALE",
  dateOfBirth: "1992-04-10",
  nin: "ab-123 456",
  hasDisability: false,
  districtId: "d1",
  chiefdomId: "c1",
  community: "Masongbo",
  phone: "076 123456",
  walletProvider: "ORANGE_MONEY",
  walletMsisdn: "",
  sizeAcres: "2.5",
  cropId: "rice",
  season: "2027-MAIN",
};

describe("registerFarmerSchema", () => {
  it("accepts and normalises a minimal valid record", () => {
    const r = registerFarmerSchema.parse(valid);
    expect(r.fullName).toBe("Aminata Sesay");
    expect(r.phone).toBe("+23276123456");
    expect(r.nin).toBe("AB123456");
    expect(r.walletMsisdn).toBeNull();
    expect(r.sizeAcres).toBe(2.5);
    expect(r.dateOfBirth).toBeInstanceOf(Date);
  });

  it("requires consent to register", () => {
    expect(registerFarmerSchema.safeParse({ ...valid, consentToRegister: false }).success).toBe(
      false,
    );
  });

  it("rejects implausible dates of birth", () => {
    expect(registerFarmerSchema.safeParse({ ...valid, dateOfBirth: "2020-01-01" }).success).toBe(
      false,
    );
  });

  it("rejects GPS outside Sierra Leone", () => {
    expect(
      registerFarmerSchema.safeParse({ ...valid, latitude: 51.5, longitude: -0.12 }).success,
    ).toBe(false);
    expect(
      registerFarmerSchema.safeParse({ ...valid, latitude: 8.88, longitude: -12.04 }).success,
    ).toBe(true);
  });

  it("accepts optional fields as empty", () => {
    const r = registerFarmerSchema.parse({
      ...valid,
      dateOfBirth: "",
      nin: "",
      walletProvider: null,
    });
    expect(r.dateOfBirth).toBeNull();
    expect(r.nin).toBeNull();
  });
});

describe("csvFarmerRowSchema", () => {
  it("parses a template row", () => {
    const r = csvFarmerRowSchema.parse({
      full_name: "Mohamed Kamara",
      gender: "m",
      phone: "077100200",
      date_of_birth: "1988-01-01",
      nin: "",
      district_code: "bom",
      chiefdom: "Gbanti",
      community: "Kagbo",
      crop_code: "rice",
      farm_size_acres: "3",
      wallet_provider: "Orange Money",
    });
    expect(r.gender).toBe("MALE");
    expect(r.district_code).toBe("BOM");
    expect(r.crop_code).toBe("RICE");
    expect(r.wallet_provider).toBe("ORANGE_MONEY");
  });
});

describe("common helpers", () => {
  it("derives the season", () => {
    expect(currentSeason(new Date("2027-06-15"))).toBe("2027-MAIN");
    expect(currentSeason(new Date("2027-12-01"))).toBe("2027-DRY");
    expect(currentSeason(new Date("2028-02-01"))).toBe("2027-DRY");
  });
  it("identifies youth (18–35)", () => {
    const at = new Date("2027-01-01");
    expect(isYouth(new Date("2000-01-01"), at)).toBe(true);
    expect(isYouth(new Date("1980-01-01"), at)).toBe(false);
    expect(isYouth(null, at)).toBe(false);
  });
});
