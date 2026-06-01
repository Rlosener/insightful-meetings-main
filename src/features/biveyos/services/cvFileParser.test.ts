import { describe, expect, it } from "vitest";
import { parseCvFile } from "./cvFileParser";

describe("parseCvFile", () => {
  it("extracts text from a plain CV file", async () => {
    const file = new File([
      "Ece Yılmaz\nProduct Designer\nFigma, araştırma, tasarım sistemi ve discovery deneyimi.",
    ], "ece-yilmaz-cv.txt", { type: "text/plain" });

    const result = await parseCvFile(file);

    expect(result.fileName).toBe("ece-yilmaz-cv.txt");
    expect(result.text).toContain("Product Designer");
    expect(result.text).toContain("tasarım sistemi");
  });

  it("rejects unsupported CV formats", async () => {
    const file = new File(["deneme"], "cv.xls", { type: "application/vnd.ms-excel" });

    await expect(parseCvFile(file)).rejects.toThrow("desteklenmiyor");
  });
});

