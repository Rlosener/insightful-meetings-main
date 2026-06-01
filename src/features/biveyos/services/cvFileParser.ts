import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

export const ACCEPTED_CV_FILE_FORMATS = ".pdf,.docx,.txt,.md,.rtf";
export const MAX_CV_FILE_BYTES = 8 * 1024 * 1024;

export interface ParsedCvFile {
  fileName: string;
  text: string;
  warning?: string;
}

const NULL_CHARACTER = new RegExp(String.fromCharCode(0), "g");

const normalizeText = (value: string) =>
  value
    .replace(NULL_CHARACTER, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const extensionOf = (fileName: string) =>
  fileName.split(".").pop()?.toLocaleLowerCase("tr-TR") || "";

const stripRtf = (value: string) =>
  value
    .replace(/\\'[0-9a-f]{2}/gi, " ")
    .replace(/\\[a-z]+\d* ?/gi, " ")
    .replace(/[{}]/g, " ");

const readArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Dosya belleğe alınamadı."));
    };
    reader.onerror = () => reject(reader.error || new Error("Dosya okunamadı."));
    reader.readAsArrayBuffer(file);
  });
};

const readTextFile = async (file: File) => {
  if (typeof file.text === "function") return normalizeText(await file.text());
  return normalizeText(new TextDecoder("utf-8").decode(await readArrayBuffer(file)));
};

const extractDocxText = async (file: File) => {
  const mammothModule = await import("mammoth");
  const mammoth = ("extractRawText" in mammothModule ? mammothModule : mammothModule.default) as {
    extractRawText: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string; messages?: unknown[] }>;
  };
  const result = await mammoth.extractRawText({ arrayBuffer: await readArrayBuffer(file) });
  return normalizeText(result.value || "");
};

const extractPdfText = async (file: File) => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(await readArrayBuffer(file)),
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => "str" in item ? item.str : "")
      .filter(Boolean)
      .join(" ");
    if (text.trim()) pages.push(text);
  }

  return normalizeText(pages.join("\n\n"));
};

export const parseCvFile = async (file: File): Promise<ParsedCvFile> => {
  if (file.size > MAX_CV_FILE_BYTES) {
    throw new Error("CV dosyası 8 MB sınırını aşıyor.");
  }

  const extension = extensionOf(file.name);
  let text = "";

  if (extension === "pdf") {
    text = await extractPdfText(file);
  } else if (extension === "docx") {
    text = await extractDocxText(file);
  } else if (extension === "rtf") {
    text = normalizeText(stripRtf(await readTextFile(file)));
  } else if (["txt", "md", "text"].includes(extension) || file.type.startsWith("text/")) {
    text = await readTextFile(file);
  } else {
    throw new Error("Bu CV formatı desteklenmiyor. PDF, DOCX, TXT, MD veya RTF yükleyin.");
  }

  if (text.length < 40) {
    throw new Error("CV dosyasından yeterli metin çıkarılamadı. Lütfen metni manuel yapıştırın veya PDF/DOCX dosyasını kontrol edin.");
  }

  return {
    fileName: file.name,
    text,
    warning: text.length > 12000 ? "CV metni uzun. AI değerlendirmede ilk 12.000 karakter önceliklendirilecek." : undefined,
  };
};
