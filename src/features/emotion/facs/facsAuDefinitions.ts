export type FacsAuId =
  | "AU1"
  | "AU2"
  | "AU4"
  | "AU5"
  | "AU6"
  | "AU7"
  | "AU12"
  | "AU15"
  | "AU23"
  | "AU25"
  | "AU45";

export interface FacsAuDefinition {
  au: FacsAuId;
  name: string;
  description: string;
}

export const FACS_AU_DEFINITIONS: Record<FacsAuId, FacsAuDefinition> = {
  AU1: {
    au: "AU1",
    name: "Inner Brow Raiser",
    description: "Kaş iç kısmında yükselme ipucu.",
  },
  AU2: {
    au: "AU2",
    name: "Outer Brow Raiser",
    description: "Kaş dış kısmında yükselme ipucu.",
  },
  AU4: {
    au: "AU4",
    name: "Brow Lowerer",
    description: "Kaşlarda aşağı çekilme veya kas arası gerilim ipucu.",
  },
  AU5: {
    au: "AU5",
    name: "Upper Lid Raiser",
    description: "Üst göz kapağı açıklığında artış ipucu.",
  },
  AU6: {
    au: "AU6",
    name: "Cheek Raiser",
    description: "Yanak yükselmesi ve göz çevresi daralma ipucu.",
  },
  AU7: {
    au: "AU7",
    name: "Lid Tightener",
    description: "Göz kapağı sıkılaşması ipucu.",
  },
  AU12: {
    au: "AU12",
    name: "Lip Corner Puller",
    description: "Dudak köşesinde yukarı çekilme ipucu.",
  },
  AU15: {
    au: "AU15",
    name: "Lip Corner Depressor",
    description: "Dudak köşesinde aşağı yönlü gerilim ipucu.",
  },
  AU23: {
    au: "AU23",
    name: "Lip Tightener",
    description: "Dudaklarda sıkılaşma ipucu.",
  },
  AU25: {
    au: "AU25",
    name: "Lips Part",
    description: "Dudakların ayrılması veya konuşma açıklığı ipucu.",
  },
  AU45: {
    au: "AU45",
    name: "Blink",
    description: "Göz kırpma veya kısa süreli göz kapanması ipucu.",
  },
};

export const KNOWN_FACS_AU_IDS = Object.keys(FACS_AU_DEFINITIONS) as FacsAuId[];
