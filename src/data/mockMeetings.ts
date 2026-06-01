export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: string;
  type: "mülakat" | "toplantı";
  status: "analiz edildi" | "analiz ediliyor" | "bekliyor";
  participants: string[];
  overallScore?: number;
  summary?: string;
  actionItems?: string[];
  scores?: {
    iletisim: number;
    liderlik: number;
    teknik: number;
    katilim: number;
  };
  sentimentTimeline?: { time: string; score: number }[];
  keyMoments?: { time: string; label: string; type: "pozitif" | "nötr" | "negatif" }[];
}

export const mockMeetings: Meeting[] = [
  {
    id: "1",
    title: "Kıdemli Frontend Geliştirici Mülakatı",
    date: "2026-03-07",
    duration: "45 dk",
    type: "mülakat",
    status: "analiz edildi",
    participants: ["Ahmet Yılmaz", "Zeynep Kaya"],
    overallScore: 82,
    summary: "Aday güçlü teknik bilgiye sahip, React ve TypeScript konusunda derinlemesine deneyim gösterdi. İletişim becerileri iyi, ancak liderlik deneyimi sınırlı. Takım çalışmasına yatkın, problem çözme yaklaşımı sistematik.",
    actionItems: [
      "Referans kontrolü yapılacak",
      "Teknik case study gönderilecek",
      "2. tur mülakat planlanacak",
      "Maaş beklentisi görüşülecek",
    ],
    scores: { iletisim: 85, liderlik: 65, teknik: 92, katilim: 78 },
    sentimentTimeline: [
      { time: "0:00", score: 60 }, { time: "5:00", score: 70 }, { time: "10:00", score: 75 },
      { time: "15:00", score: 80 }, { time: "20:00", score: 85 }, { time: "25:00", score: 72 },
      { time: "30:00", score: 88 }, { time: "35:00", score: 90 }, { time: "40:00", score: 82 },
      { time: "45:00", score: 85 },
    ],
    keyMoments: [
      { time: "12:30", label: "React performans optimizasyonu hakkında detaylı açıklama", type: "pozitif" },
      { time: "22:15", label: "Liderlik deneyimi sorusunda belirsiz yanıt", type: "negatif" },
      { time: "35:00", label: "Canlı kodlama testinde başarılı çözüm", type: "pozitif" },
    ],
  },
  {
    id: "2",
    title: "Haftalık Sprint Değerlendirmesi",
    date: "2026-03-06",
    duration: "30 dk",
    type: "toplantı",
    status: "analiz edildi",
    participants: ["Elif Demir", "Can Aksoy", "Selin Öz", "Mert Yıldız"],
    overallScore: 74,
    summary: "Sprint hedeflerinin %80'i tamamlandı. API entegrasyonu gecikti, frontend geliştirmeler zamanında bitti. Ekip motivasyonu iyi, ancak iletişimde küçük aksaklıklar tespit edildi.",
    actionItems: [
      "API entegrasyonu için ek kaynak atanacak",
      "Günlük stand-up süresi 15 dk ile sınırlandırılacak",
      "Retrospektif toplantısı planlanacak",
    ],
    scores: { iletisim: 70, liderlik: 72, teknik: 80, katilim: 75 },
    sentimentTimeline: [
      { time: "0:00", score: 65 }, { time: "5:00", score: 68 }, { time: "10:00", score: 72 },
      { time: "15:00", score: 78 }, { time: "20:00", score: 70 }, { time: "25:00", score: 75 },
      { time: "30:00", score: 74 },
    ],
    keyMoments: [
      { time: "8:00", label: "Sprint hedeflerinin başarı oranı paylaşıldı", type: "pozitif" },
      { time: "18:00", label: "API gecikmesi hakkında tartışma", type: "negatif" },
    ],
  },
  {
    id: "3",
    title: "UX Tasarımcı Mülakatı",
    date: "2026-03-05",
    duration: "50 dk",
    type: "mülakat",
    status: "analiz edildi",
    participants: ["Deniz Acar", "Selin Öz"],
    overallScore: 91,
    summary: "Aday olağanüstü tasarım portföyüne ve kullanıcı araştırma deneyimine sahip. Figma ve design system konusunda uzman. Sunum becerileri çok güçlü, iletişimi akıcı ve profesyonel.",
    actionItems: [
      "Teklif hazırlanacak",
      "Takım ile tanışma toplantısı ayarlanacak",
      "Başlangıç tarihi belirlenecek",
    ],
    scores: { iletisim: 95, liderlik: 85, teknik: 90, katilim: 92 },
    sentimentTimeline: [
      { time: "0:00", score: 75 }, { time: "10:00", score: 82 }, { time: "20:00", score: 88 },
      { time: "30:00", score: 92 }, { time: "40:00", score: 90 }, { time: "50:00", score: 91 },
    ],
    keyMoments: [
      { time: "15:00", label: "Portföy sunumu çok etkileyici", type: "pozitif" },
      { time: "30:00", label: "Design system yaklaşımı detaylı ve sistematik", type: "pozitif" },
      { time: "42:00", label: "Kullanıcı araştırma metodolojisi güçlü", type: "pozitif" },
    ],
  },
  {
    id: "4",
    title: "Ürün Yol Haritası Toplantısı",
    date: "2026-03-04",
    duration: "60 dk",
    type: "toplantı",
    status: "analiz ediliyor",
    participants: ["Elif Demir", "Can Aksoy", "Ahmet Yılmaz", "Zeynep Kaya", "Mert Yıldız"],
    overallScore: undefined,
  },
  {
    id: "5",
    title: "Backend Geliştirici Mülakatı",
    date: "2026-03-03",
    duration: "40 dk",
    type: "mülakat",
    status: "bekliyor",
    participants: ["Burak Şen", "Can Aksoy"],
    overallScore: undefined,
  },
];
