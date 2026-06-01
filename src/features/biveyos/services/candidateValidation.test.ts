import { describe, expect, it } from "vitest";
import { validateCandidate } from "./candidateValidation";
import type { BiveyosCandidateRecord } from "../types";

const baseCandidate: BiveyosCandidateRecord = {
  id: "candidate-1",
  firstName: "Ece",
  lastName: "Yılmaz",
  fullName: "Ece Yılmaz",
  email: "",
  phone: "",
  jobTitle: "Product Designer",
  department: "Tasarım",
  experienceYears: "4",
  education: "",
  jobDescription: "Figma ve ürün keşfi deneyimi bekleniyor.",
  cvText: "Figma, araştırma ve tasarım sistemi deneyimi.",
  notes: "",
  status: "Hazırlık",
  source: "Manuel CRM",
  createdAt: "2026-05-29T00:00:00.000Z",
};

describe("validateCandidate", () => {
  it("accepts a complete manual candidate record", () => {
    expect(validateCandidate(baseCandidate)).toEqual({ valid: true, errors: [] });
  });

  it("requires identity, position and CV text", () => {
    const result = validateCandidate({
      ...baseCandidate,
      firstName: "",
      lastName: "",
      jobTitle: "",
      cvText: "",
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Ad zorunlu.");
    expect(result.errors).toContain("Soyad zorunlu.");
    expect(result.errors).toContain("Başvurulan pozisyon zorunlu.");
    expect(result.errors).toContain("CV metni zorunlu.");
  });
});
