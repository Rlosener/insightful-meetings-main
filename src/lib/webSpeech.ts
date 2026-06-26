export type WebSpeechSupport = "supported" | "unsupported";

export const detectWebSpeechSupport = (): WebSpeechSupport => {
  if (typeof window === "undefined") return "unsupported";
  const win = window as Window & {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition ? "supported" : "unsupported";
};

export const webSpeechSupportMessage = (support: WebSpeechSupport) =>
  support === "supported"
    ? "Canlı transkript bu tarayıcıda destekleniyor. Kayıt bitince ses dosyasından da doğrulama yapılır."
    : "Bu tarayıcı canlı transkript desteklemiyor. Kayıt bitince ses dosyasından sunucu tarafı transkript üretilecek.";
