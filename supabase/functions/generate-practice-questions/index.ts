import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, handleAIError } from "../_shared/ai-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

const compact = (value: unknown, max = 7000) => {
  const normalized = text(value).replace(/\s+/g, " ");
  return normalized.length > max ? `${normalized.slice(0, max - 3).trim()}...` : normalized;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      candidateName,
      position,
      department,
      experienceYears,
      skills,
      difficulty,
      interviewStyle,
      questionCount,
      targetCompany,
      userNotes,
      cvText,
      cvFileName,
      jobDescription,
    } = await req.json();

    const difficultyMap: Record<string, string> = {
      easy: "Kolay — giriş seviyesi, genel sorular. Adayı rahatlatacak, temel yetkinlikleri ölçecek sorular.",
      medium: "Orta — deneyimli adaylar için derinlemesine sorular. Somut örnekler ve teknik detaylar beklenen sorular.",
      hard: "Zor — üst düzey pozisyonlar için stratejik, analitik ve baskı altında düşünme gerektiren sorular.",
    };

    const styleMap: Record<string, string> = {
      formal: "Resmi ve profesyonel ton. Kurumsal dil kullan, yapılandırılmış sorular sor.",
      conversational: "Samimi ve doğal ton. Sohbet havasında, adayı rahatlatacak ancak derinlemesine sorular.",
      challenging: "Zorlayıcı ve provokatif ton. Adayı düşündürecek, savunma pozisyonuna sokabilecek keskin sorular.",
      executive: "Üst yönetim seviyesi. Vizyon, strateji, liderlik ve iş etkisi odaklı sorular.",
    };

    const count = questionCount || 15;
    const diffDesc = difficultyMap[difficulty] || difficultyMap.medium;
    const styleDesc = styleMap[interviewStyle] || styleMap.formal;

    const response = await callAI({
      messages: [
        {
          role: "system",
          content: `Sen dünya standartlarında bir İK mülakatçısısın. Google, McKinsey, Amazon, Apple gibi şirketlerin GERÇEK mülakat kalitesinde sorular üretiyorsun.

SORU ÜRETİM SİSTEMİ — ZORlUK PROGRESYONu:
Soruları zorluk sırasına göre üret. İlk %25'i ISINDIRMA soruları (kolay, rahatlatıcı), ortadaki %50'si ANA sorular (orta zorluk), son %25'i ZORLAYICI sorular (zor, baskı altı) olmalı.

ISINDIRMA SORULARI (İlk birkaç soru):
- "Kendinizi ve kariyerinizi kısaca anlatır mısınız?" benzeri açılış sorusu İLE BAŞLA
- Motivasyon, kariyer tercihi gibi rahatlatıcı sorular
- Adayı konuşturan, stres azaltan sorular

ANA SORULAR (Ortadaki sorular):
- Davranışsal (STAR) sorular — "Bir dönemde... yaşadığınız bir durumu anlatın"
- Durumsal sorular — gerçek iş senaryoları
- Role özel teknik/fonksiyonel sorular

ZORLAYICI SORULAR (Son birkaç soru):
- Baskı altı karar alma
- Etik ikilemler
- Zor senaryo çözümleri
- Stratejik düşünme

GERÇEK MÜLAKAT PATERNLERİ:
1. ${position} pozisyonu için sektördeki EN YAYGIN soruları referans al
2. Amazon Leadership Principles, Google'ın yapılandırılmış mülakatı gibi metodolojileri kullan
3. Her sorunun hangi yetkinliği ölçtüğünü belirt
4. Gerçek şirket mülakatlarında sorulan sorulardan ilham al
${targetCompany ? `
HEDEF ŞİRKET: ${targetCompany}
- Bu şirketin bilinen mülakat tarzını ve değerlerini yansıt
- Şirketin sektörü, kültürü ve beklentilerine uygun sorular üret
- Şirketin değer verdiği yetkinliklere odaklan (ör: ${targetCompany} gibi bir şirkette önemli olan liderlik, inovasyon, müşteri odaklılık vb.)` : ""}
${userNotes ? `
ADAY HAKKINDA NOTLAR: ${userNotes}
- Bu bilgileri soruları kişiselleştirmek için kullan
- Adayın CV iddialarını, belirsiz noktalarını ve rol için kritik risk alanlarını doğrulayacak sorular ekle
- Adayın endişeleriyle ilgili alanlarda destekleyici ama zorlayıcı sorular sor` : ""}
${cvText ? `
CV VE POZİSYON KANITI:
- Aday: ${candidateName || "Belirtilmemiş"}
- CV dosyası: ${cvFileName || "Belirtilmemiş"}
- İş tanımı: ${compact(jobDescription, 2500)}
- CV metni: ${compact(cvText, 7000)}
- Soruların en az yarısı CV'deki somut deneyim, proje, teknoloji, metrik, görev veya tarih iddialarını ${position} pozisyonu beklentisiyle doğrulasın.
- Role Özel ve Davranışsal sorularda CV'den görülen bir ayrıntıya açık referans ver.
- CV'de belirsiz kalan sorumluluk, sahiplik, ekip büyüklüğü, ölçülebilir sonuç ve karar etkisi alanlarını açığa çıkar.
- CV'de olmayan deneyimi adayda varmış gibi varsayma.` : ""}

ZORLUK SEVİYESİ: ${diffDesc}
MÜLAKAT TARZI: ${styleDesc}

SORU KATEGORİLERİ:
- "Isındırma" — Açılış soruları, motivasyon, kariyer hikayesi
- "Davranışsal" — STAR metodu ile geçmiş deneyimleri sorgulayan sorular
- "Durumsal" — Gerçek iş senaryolarına dayalı "Ne yapardınız?" soruları
- "Role Özel" — Pozisyonun teknik/fonksiyonel gereksinimlerine özel sorular
- "Problem Çözme" — Analitik düşünme ve yaratıcı çözüm gerektiren sorular
- "Liderlik" — Ekip yönetimi, etki alanı ve karar alma sorguları
- "Baskı Altı" — Zor, zorlayıcı, etik ikilem soruları`,
        },
        {
          role: "user",
          content: `Pozisyon: ${position}
Departman: ${department || "Belirtilmemiş"}
Deneyim: ${experienceYears || "Belirtilmemiş"} yıl
Yetenekler: ${(skills || []).join(", ") || "Belirtilmemiş"}${targetCompany ? `\nHedef Şirket: ${targetCompany}` : ""}${userNotes ? `\nAday Notları: ${userNotes}` : ""}${cvText ? `\n\nCV dosyası: ${cvFileName || "Belirtilmemiş"}\nİş tanımı:\n${compact(jobDescription, 2500)}\n\nCV metni:\n${compact(cvText, 7000)}` : ""}

Aşağıdaki JSON formatında ${count} adet yüksek kaliteli mülakat sorusu üret.

ÖNEMLİ: Soruları zorluk progresyonuna göre SIRALA:
1. İlk 2-3 soru: Isındırma (kolay, rahatlatıcı) — İLK SORU mutlaka "Kendinizi tanıtın" tarzı açılış olsun
2. Ortadaki sorular: Davranışsal + Durumsal + Role Özel (orta)
3. Son 2-3 soru: Baskı altı + Problem çözme (zor)

{
  "questions": [
    {
      "category": "Isındırma" | "Davranışsal" | "Durumsal" | "Role Özel" | "Problem Çözme" | "Liderlik" | "Baskı Altı",
      "question": string (düşündürücü, spesifik, pozisyona özel soru),
      "difficulty": "easy" | "medium" | "hard",
      "questionType": "warmup" | "behavioral" | "situational" | "role-specific" | "problem-solving" | "leadership" | "pressure",
      "tip": string (mülakatçıya yönelik kısa ipucu — adayda ne gözlemlemeli),
      "competency": string (bu sorunun ölçtüğü yetkinlik — ör: "iletişim", "problem çözme", "liderlik"),
      "ideal_answer_hints": string (iyi bir cevabın içermesi gereken 2-3 anahtar nokta)
    }
  ]
}

KURALLAR:
- İLK SORU "Kendinizi ve kariyerinizi kısaca anlatır mısınız?" veya benzeri bir açılış sorusu OLMALI
- Sorular ${position} pozisyonuna ve ${(skills || []).join(", ")} yeteneklerine ÖZEL olsun
- CV metni verildiyse sorular adayın CV'sindeki somut iddiaları pozisyon beklentileriyle doğrulamalı; jenerik soru üretme
- En az 4 soru CV kaynaklı bir proje, rol, yetkinlik veya sonuç ayrıntısını açtırmalı
- Sektördeki gerçek mülakat sorularından ilham al
- Her sorunun ideal cevap ipuçlarını ekle
- Sorular doğal zorluk progresyonunda sıralanmış olsun
- Adaya peşinen pozitif varsayım yükleme; sorular ölçen, doğrulayan ve gerektiğinde risk açığa çıkaran tonda olsun`,
        },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const errorResponse = handleAIError(response, corsHeaders);
    if (errorResponse) return errorResponse;

    if (!response.ok) throw new Error(`AI error: ${response.status}`);

    const aiResponse = await response.json();
    const result = JSON.parse(aiResponse.choices[0].message.content);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
