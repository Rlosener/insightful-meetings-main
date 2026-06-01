export type HrEmotionKey = "happy" | "neutral" | "fear" | "angry" | "disgust" | "sad" | "surprise";

export interface HrEmotionSample {
  emotion: HrEmotionKey;
  confidence: number;
  ts: number;
}

export interface HrEmotionObservation {
  state: string;
  label: string;
  note: string;
  attention: string;
  total: number;
  avgConfidence: number;
  switchRate: number;
  distribution: Record<HrEmotionKey, number>;
}

const EMPTY_DISTRIBUTION: Record<HrEmotionKey, number> = {
  happy: 0,
  neutral: 0,
  fear: 0,
  angry: 0,
  disgust: 0,
  sad: 0,
  surprise: 0,
};

const stablePick = (options: string[], seed: string, salt: string) => {
  if (options.length === 0) return "";
  let hash = 0;
  const input = `${seed}|${salt}`;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(index);
    hash |= 0;
  }
  return options[Math.abs(hash) % options.length];
};

const phraseBook = {
  titles: {
    rahat: ["Rahat", "Rahat ve iletişime açık", "Uyumlu ve rahat", "Dengeli ve açık", "Rahat ama kontrollü"],
    temkinli: ["Temkinli", "Kontrollü ve temkinli", "Ölçülü ve temkinli", "Temkinli ama uyumlu", "Rahatlamak için zamana ihtiyaç duyuyor"],
    gergin: ["Gergin", "Kontrollü ama gergin", "Baskı altında zorlanan", "Gergin ve savunmalı", "Konforu dalgalanan"],
    mesafeli: ["Mesafeli", "Kontrollü ve mesafeli", "Mesafesini koruyan", "Sürece tam ısınmamış", "Yakınlık kurmakta sınırlı"],
    dusuk_enerjili: ["Düşük enerjili", "Sakin ama düşük tempolu", "İçe dönük ve düşük enerjili", "Enerjisi sınırlı", "Düşük tempolu"],
    karisik: ["Karışık", "Dalgalı ama ölçülü", "Tam rahat olmayan", "Sinyalleri değişken", "Ani tepki eğilimi gösteren"],
  },
  openers: {
    rahat: [
      "Aday görüşme boyunca genel olarak rahat ve iletişime açık bir çizgi izliyor",
      "Sorulara yaklaşırken uyumlu ve dengeli bir görünüm veriyor",
      "Görüşme ortamına görece hızlı adapte olan bir profil sergiliyor",
      "İfade akışında doğal ve kontrollü bir rahatlık hissediliyor",
      "Konuşma temposu içinde açık ve olumlu bir katılım dikkat çekiyor",
    ],
    temkinli: [
      "Aday kendini ifade ederken ölçülü ve temkinli bir çizgide kalıyor",
      "Yanıtlarında kontrollü ilerleyen bir iletişim tarzı öne çıkıyor",
      "Görüşme boyunca önce tartıp sonra yanıt verme eğilimi dikkat çekiyor",
      "Rahatlamakta zaman alan bir iletişim yapısı görülüyor",
      "İfade biçiminde dikkatli ve kontrollü bir ilerleme hissediliyor",
    ],
    gergin: [
      "Baskı artan anlarda adayın iletişim rahatlığı belirgin biçimde daralıyor",
      "Bazı sorularda daha savunmalı ve gergin bir tepki yapısı oluşuyor",
      "Görüşme akışında konfor seviyesinin kolayca aşağı indiği görülüyor",
      "İfade akışında baskı anlarına duyarlı bir yapı dikkat çekiyor",
    ],
    mesafeli: [
      "Görüşme akışında belirli bir mesafe koruma eğilimi dikkat çekiyor",
      "Bazı başlıklarda sürece tam olarak ısınmamış bir görünüm oluşuyor",
      "İletişimde yakınlık kurmaktan çok kontrol ve sınır belirleme öne çıkıyor",
      "Katılım sürse de duygusal yakınlık seviyesi düşük görünüyor",
    ],
    dusuk_enerjili: [
      "İfade temposunda düşük enerji ve içe dönük bir çizgi öne çıkıyor",
      "Yanıtlar daha sakin ve düşük tempolu bir akışla geliyor",
      "Görüşme boyunca enerji seviyesi sınırlı bir görünüm oluşuyor",
      "Konuşma akışında içe dönük ve ağır ilerleyen bir ritim hissediliyor",
    ],
    karisik: [
      "Görüşme boyunca sinyaller tek yönde toplanmıyor; dalgalı bir iletişim yapısı görülüyor",
      "Yanıt akışı içinde farklı yönlere giden tepkiler bir arada oluşuyor",
      "Blok boyunca görünüm sabit değil; rahatlık ve temkinlilik birlikte görülüyor",
      "Soruların yapısına göre yaklaşım belirgin şekilde değişebiliyor",
    ],
  },
  comfort: {
    high: [
      "Kendini ifade ederken konfor seviyesi yüksek görünüyor",
      "Sorulara girerken rahat bir iletişim zemini koruyor",
      "Cevaplarını verirken iletişim rahatlığı güçlü kalıyor",
      "Görüşme temposuna uyumlu ve akıcı bir katılım gösteriyor",
    ],
    medium: [
      "İletişime açık görünmekle birlikte tamamen rahat bir çizgide değil",
      "Konfor seviyesi orta düzeyde ve konuya göre değişebiliyor",
      "Cevap verirken rahatlık ile kontrollülük arasında dengede kalıyor",
      "İfade ederken zaman zaman temkinli, zaman zaman daha açık bir tutum sergiliyor",
    ],
    low: [
      "Kendini ifade ederken konfor seviyesi sınırlı görünüyor",
      "Görüşme akışında tam anlamıyla rahatlayamadığı izlenimi oluşuyor",
      "İfade sırasında dikkatli ve kendini koruyan bir çizgi ağır basıyor",
      "Konfor seviyesi düşük olduğu için yanıtlar daha kontrollü ilerliyor",
    ],
  },
  stress: {
    low: [
      "Baskı sinyali düşük ve iletişim dengeli ilerliyor",
      "Gerilim seviyesi görüşme akışını belirgin biçimde bozmuyor",
      "İletişimde baskı hissi sınırlı kalıyor",
      "Yanıt verirken gerginlikten çok düzen hissi korunuyor",
    ],
    medium: [
      "Zaman zaman kontrollü bir gerilim hissi oluşuyor",
      "Bazı sorularda stres seviyesi kısa süreli yükseliyor",
      "Görüşme boyunca ölçülü ama hissedilir bir baskı etkisi var",
      "İletişim akışı genel olarak korunuyor ancak ara ara gerilim beliriyor",
    ],
    high: [
      "Baskı altında kalınca gerginlik seviyesi yükseliyor gibi görünüyor",
      "Sorular zorlaştığında stres belirtileri belirginleşiyor",
      "Görüşme baskısı iletişim konforunu doğrudan etkiliyor",
      "Baskı etkisi altında daha savunmalı ve daralan bir akış oluşuyor",
    ],
  },
  balance: {
    stable: [
      "Genel denge büyük ölçüde korunuyor",
      "Tepki yapısı blok boyunca tutarlı kalıyor",
      "İletişim çizgisi belirgin dalgalanma göstermiyor",
      "Yanıt temposu içinde denge hissi sürüyor",
    ],
    mixed: [
      "Blok içinde tam olarak tek bir çizgi oluşmuyor",
      "Görünüm tek bir yöne oturmaktan çok geçişli ilerliyor",
      "Yaklaşımda hem kontrollü hem de temkinli anlar bir arada görülüyor",
      "Akış boyunca denge korunmakla birlikte küçük dalgalanmalar oluşuyor",
    ],
    variable: [
      "Blok içinde belirgin geçişler ve ani yön değişimleri görülüyor",
      "Tepki yapısı kısa aralıklarla değişebiliyor",
      "Yanıt temposu içinde istikrar sınırlı kalıyor",
      "İletişim görünümü sabit değil, dalgalı ilerliyor",
    ],
  },
  response: {
    open: [
      "Yanıt verirken yakın ve uyumlu bir ilişki kurmaya açık görünüyor",
      "İletişim dili açık, katılımcı ve karşılık vermeye istekli ilerliyor",
      "Karşılıklı akışı besleyen daha açık bir anlatım kullanıyor",
      "Yanıt verirken temas kurmaktan kaçınmayan bir yaklaşım gösteriyor",
    ],
    controlled: [
      "Yanıtlarını ölçülü ve kontrollü biçimde çerçeveliyor",
      "Cevaplarını temkinli ama düzenli bir yapı içinde veriyor",
      "İfade biçimi kontrollü ve sınırlarını koruyan bir çizgide ilerliyor",
      "Yanıtlar planlı ve dikkatli bir akışla geliyor",
    ],
    guarded: [
      "Bazı anlarda daha savunmalı ve sınır koyan bir tepki yapısı öne çıkıyor",
      "Sorular karşısında alanını koruyan daha mesafeli bir tutum oluşabiliyor",
      "Yanıt verirken kendini koruyan bir çerçeve oluşturma eğilimi hissediliyor",
      "Cevap akışında ihtiyatlı ve korunaklı bir yaklaşım dikkat çekiyor",
    ],
    reserved: [
      "Cümlelerini daha sakin ve içe dönük bir tempoda kuruyor",
      "Yanıtlar daha düşük tempolu ve kendini geride tutan bir yapıda ilerliyor",
      "Katılım mevcut ancak dışavurum gücü düşük tempoda ilerliyor",
    ],
    reactive: [
      "Beklenmedik sorularda tepki yapısı daha görünür hale geliyor",
      "Yeni veya ani başlıklarda yaklaşımı hızla değişebiliyor",
      "Anlık uyaranlara verdiği tepki blok içinde daha görünür oluyor",
    ],
  },
  focus: {
    rahat: [
      "daha zorlayıcı ve detay isteyen sorularda da benzer rahatlığın sürüp sürmediği",
      "beklenmedik başlıklarda iletişim konforunun korunup korunmadığı",
      "kritik takip sorularında bu dengenin nasıl sürdüğü",
    ],
    temkinli: [
      "açık uçlu sorularda rahatlama seviyesinin artıp artmadığı",
      "örnek vermesi istenen anlarda iletişim akışının açılıp açılmadığı",
      "görüşme ilerledikçe kontrollü yapının yumuşayıp yumuşamadığı",
    ],
    gergin: [
      "baskı oluşturan başlıklarda iletişim konforunun yeniden gözlemlenmesi",
      "itiraz veya karşı soru içeren anlarda gerilimin artıp artmadığı",
      "zorlayıcı senaryolarda savunmalı çizginin sürüp sürmediği",
    ],
    mesafeli: [
      "ilişki kurmaya dönük sorularda mesafenin azalıp azalmadığı",
      "karşılıklı diyalog arttığında yakınlık seviyesinin farklılaşıp farklılaşmadığı",
      "görüşme ilerledikçe bu kontrollü mesafenin devam edip etmediği",
    ],
    dusuk_enerjili: [
      "tempo yükselten sorularda katılım seviyesinin değişip değişmediği",
      "somut örnek istenen anlarda enerji düzeyinin toparlanıp toparlanmadığı",
      "görüşme akışı ilerledikçe ifade temposunun açılıp açılmadığı",
    ],
    karisik: [
      "beklenmedik sorularda bu dalgalı görünümün tekrar edip etmediği",
      "konu tipi değiştiğinde yaklaşımın nasıl yön değiştirdiği",
      "farklı zorluk seviyelerindeki sorularda tutarlılık oluşup oluşmadığı",
    ],
  },
};

type ObservationState = keyof typeof phraseBook.titles;

export const buildEmotionObservation = (samples: HrEmotionSample[]): HrEmotionObservation => {
  const avgConfidence = samples.length
    ? samples.reduce((sum, sample) => sum + sample.confidence, 0) / samples.length
    : 0;

  if (samples.length < 3) {
    return {
      state: "veri_sinirli",
      label: "Veri sınırlı",
      note: "Anlık yorum için en az 3 duygu örneği bekleniyor. Bu aşamada tek başına çıkarım yapılmaz.",
      attention: "Duygu sinyali destekleyici veridir; karar için transkript ve yanıt içeriğiyle birlikte değerlendirilmelidir.",
      total: samples.length,
      avgConfidence,
      switchRate: 0,
      distribution: { ...EMPTY_DISTRIBUTION },
    };
  }

  const counts = samples.reduce<Record<HrEmotionKey, number>>((acc, sample) => {
    acc[sample.emotion] += 1;
    return acc;
  }, { ...EMPTY_DISTRIBUTION });
  const total = samples.length;
  const pct = Object.fromEntries(
    Object.entries(counts).map(([key, count]) => [key, count / total]),
  ) as Record<HrEmotionKey, number>;
  const changes = samples.slice(1).reduce((sum, sample, index) => (
    sample.emotion !== samples[index].emotion ? sum + 1 : sum
  ), 0);
  const switchRate = changes / Math.max(1, samples.length - 1);
  const sortedPct = Object.values(pct).sort((a, b) => b - a);
  const dominantGap = sortedPct.length > 1 ? sortedPct[0] - sortedPct[1] : sortedPct[0];
  const positive = pct.happy + (pct.neutral * 0.65);
  const tension = pct.angry + pct.fear;
  const distance = pct.disgust + (pct.angry * 0.35);
  const lowEnergy = pct.sad + (pct.fear * 0.25);
  const reactivity = pct.surprise + (switchRate * 0.55);

  let state: ObservationState;
  if (distance >= 0.36 && distance + tension >= 0.58) {
    state = "mesafeli";
  } else if (tension >= 0.48 || (pct.angry >= 0.30 && pct.fear >= 0.18)) {
    state = "gergin";
  } else if (lowEnergy >= 0.46 || (pct.sad >= 0.32 && pct.fear >= 0.18)) {
    state = "dusuk_enerjili";
  } else if (positive >= 0.68 && tension < 0.26 && distance < 0.20 && switchRate < 0.42) {
    state = "rahat";
  } else if (switchRate >= 0.58 || (reactivity >= 0.52 && dominantGap < 0.18)) {
    state = "karisik";
  } else {
    state = "temkinli";
  }

  const comfortLevel: keyof typeof phraseBook.comfort =
    positive >= 0.64 && tension < 0.30 && lowEnergy < 0.28 ? "high" : positive >= 0.42 ? "medium" : "low";
  const stressLevel: keyof typeof phraseBook.stress =
    tension >= 0.45 || switchRate >= 0.58 ? "high" : tension >= 0.24 || switchRate >= 0.40 ? "medium" : "low";
  const balanceLevel: keyof typeof phraseBook.balance =
    switchRate < 0.30 && dominantGap >= 0.20 ? "stable" : switchRate < 0.55 ? "mixed" : "variable";
  const responseStyle: keyof typeof phraseBook.response = reactivity >= 0.50
    ? "reactive"
    : state === "mesafeli" || state === "gergin"
      ? "guarded"
      : state === "dusuk_enerjili"
        ? "reserved"
        : comfortLevel === "high"
          ? "open"
          : "controlled";

  const signature = [
    state,
    total,
    ...(["happy", "neutral", "fear", "angry", "disgust", "sad", "surprise"] as HrEmotionKey[])
      .map((emotion) => Math.round(pct[emotion] * 20)),
    Math.round(switchRate * 20),
  ].join("|");

  const bodyTemplates = [
    "{opener}. {comfort}. {response}.",
    "{opener}. {stress}. {balance}.",
    "{opener}. {response}. {balance}.",
  ];
  const noteTemplates = [
    "Tek başına karar ölçütü olarak kullanılmamalı; {focus} ayrıca gözlemlenebilir.",
    "Kararı tek başına belirlememeli; {focus} yeniden izlenmesi daha sağlıklı olur.",
    "Destekleyici bir gözlem olarak kullanılmalı; {focus} nasıl değiştiği takip edilebilir.",
  ];

  const note = stablePick(bodyTemplates, signature, "body")
    .replace("{opener}", stablePick(phraseBook.openers[state], signature, "opener"))
    .replace("{comfort}", stablePick(phraseBook.comfort[comfortLevel], signature, "comfort"))
    .replace("{stress}", stablePick(phraseBook.stress[stressLevel], signature, "stress"))
    .replace("{balance}", stablePick(phraseBook.balance[balanceLevel], signature, "balance"))
    .replace("{response}", stablePick(phraseBook.response[responseStyle], signature, "response"));

  return {
    state,
    label: stablePick(phraseBook.titles[state], signature, "title"),
    note,
    attention: stablePick(noteTemplates, signature, "attention")
      .replace("{focus}", stablePick(phraseBook.focus[state], signature, "focus")),
    total,
    avgConfidence,
    switchRate,
    distribution: pct,
  };
};
