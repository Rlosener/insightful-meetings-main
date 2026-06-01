

# Donebird B2B: Şirket Modülü, AI Danışman ve Sektörel Radar Yeniden İnşa Planı

## Mevcut Durum

- **CompanyPage**: Sadece personel CRUD + localStorage tabanlı notlar + tek seferlik AI analiz. Zayıf.
- **CompanyAdvisorPage**: Overview stats + chat. Çalışıyor ama şirket profili bilgisi yok, sektörel bağlam yok.
- **Sektörel Radar**: Yok.
- **Şirket Profili**: Yok (sadece text notlar localStorage'da).
- **Şirket Hafızası**: Yapılandırılmış hafıza yok.

## Mimari Yaklaşım

Şirket bölümünü 5 sekmeli (tab) tek sayfa yapısına dönüştürmek yerine, mevcut route yapısını koruyarak sidebar'a yeni linkler ekleyeceğiz. CompanyPage yeniden tasarlanacak, yeni sayfalar eklenecek.

---

## Adım 1: Veritabanı - `company_profiles` tablosu

Şirket profil bilgilerini saklamak için yeni tablo:

```sql
CREATE TABLE public.company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_name text,
  sector text,
  sub_sector text,
  products_services text[],
  import_structure text,
  export_structure text,
  target_markets text[],
  operation_cities text[],
  critical_cost_items text[],
  strategic_risks text[],
  supply_dependencies text[],
  operation_type text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
-- RLS: users can CRUD own profile
```

## Adım 2: Veritabanı - `sector_developments` tablosu

Sektörel gelişmeleri ve AI yorumlarını saklamak için:

```sql
CREATE TABLE public.sector_developments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  source text,
  development_date date DEFAULT CURRENT_DATE,
  risk_level text DEFAULT 'medium',
  opportunity_level text DEFAULT 'medium',
  cost_impact text,
  sales_impact text,
  margin_impact text,
  supply_impact text,
  market_impact text,
  ai_commentary text,
  recommended_action text,
  relevance_score integer,
  tags text[],
  created_at timestamptz DEFAULT now()
);
-- RLS: users can CRUD own developments
```

## Adım 3: Veritabanı - `advisor_history` tablosu

Danışman soru-cevap geçmişini saklamak için:

```sql
CREATE TABLE public.advisor_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question text NOT NULL,
  answer jsonb,
  sources_used text[],
  created_at timestamptz DEFAULT now()
);
-- RLS: users can CRUD own history
```

## Adım 4: Yeni Sayfa - `CompanyProfilePage.tsx`

Route: `/dashboard/company/profile`

Şirket profili formu:
- Şirket adı, sektör, alt sektör
- Ürün/hizmet grupları (tags)
- İthalat/ihracat yapısı
- Hedef pazarlar, faaliyet şehirleri
- Kritik maliyet kalemleri, stratejik riskler
- Tedarik bağımlılıkları, operasyon tipi

Veriler `company_profiles` tablosuna kaydedilecek.

## Adım 5: CompanyPage Yeniden Tasarımı

Mevcut personel CRUD'u korunacak. Üste yönetici dashboard kartları eklenecek:
- Son kritik gelişmeler (recordings'ten)
- Açık aksiyonlar sayısı
- Geciken görevler
- Tekrar eden sorunlar
- AI önerilen öncelikler (company analysis'ten)
- Şirket profili yoksa "Profil oluşturun" yönlendirmesi

Company notları localStorage'dan `company_profiles.notes`'a taşınacak.

## Adım 6: Yeni Sayfa - `SectorRadarPage.tsx`

Route: `/dashboard/company/radar`

UI yapısı:
- Şirket profili yoksa "Önce şirket profilini oluşturun" uyarısı
- Gelişme ekleme formu (başlık, açıklama, kaynak, tarih, etiketler)
- "AI ile Yorumla" butonu: Seçili gelişmeyi şirket profiliyle birlikte AI'a göndererek impact analizi yaptırır
- Gelişme kartları: risk/fırsat seviyesi, maliyet/satış/marj/tedarik/pazar etkisi, AI yorumu, önerilen aksiyon
- Filtreleme: etiket, risk seviyesi, tarih

Edge function: `company-advisor` fonksiyonuna `type: "sector_analysis"` modu eklenecek.
- Şirket profili + gelişme detayı gönderilecek
- AI, gelişmenin şirkete etkisini analiz edecek
- Düşük maliyet: tek gelişme bazında analiz (tüm listeyi birden işlemek yerine)

## Adım 7: AI Şirket Danışmanı Güçlendirme

### Backend (`company-advisor/index.ts`):
- `company_profiles` verisini çek ve context'e ekle
- `advisor_history` son 10 soruyu çek, AI'a önceki soru kalıplarını ver
- Sektörel radar gelişmelerini context'e ekle (son 10)
- Cevapları `advisor_history`'ye kaydet
- Yeni soru önerileri ekle (sektör, maliyet baskısı, tedarik vb.)

### Frontend (`CompanyAdvisorPage.tsx`):
- Mevcut yapı korunacak, genişletilecek
- "Son Sorular" bölümü (advisor_history'den)
- Şirket profili yoksa uyarı + yönlendirme
- Sektörel Radar'dan gelen gelişmeleri context olarak kullanma
- 10 hazır soru (mevcut 8 + sektörel 2)

## Adım 8: Sidebar Güncellemesi

Şirket alt menüsünü genişlet:

```
Şirket (Ana Menü altında)
  → Şirket Kadrosu (mevcut /dashboard/company)
  → Şirket Profili (/dashboard/company/profile)
  → Sektörel Radar (/dashboard/company/radar)
AI Danışman (Analiz & Raporlar altında, mevcut)
```

## Adım 9: Route Güncellemeleri (`App.tsx`)

```
<Route path="company/profile" element={<CompanyProfilePage />} />
<Route path="company/radar" element={<SectorRadarPage />} />
```

---

## Dosya Değişiklikleri Özeti

| Dosya | İşlem |
|-------|-------|
| `migration` (company_profiles, sector_developments, advisor_history) | Yeni |
| `src/pages/CompanyProfilePage.tsx` | Yeni |
| `src/pages/SectorRadarPage.tsx` | Yeni |
| `src/pages/CompanyPage.tsx` | Üst bölüme dashboard kartları ekleme |
| `src/pages/CompanyAdvisorPage.tsx` | Profil + radar + geçmiş entegrasyonu |
| `supabase/functions/company-advisor/index.ts` | sector_analysis modu + profil context + geçmiş kayıt |
| `src/components/AppSidebar.tsx` | Yeni linkler |
| `src/App.tsx` | Yeni route'lar |

## Korunan Alanlar

- B2C tarafı tamamen dokunulmaz
- Anlık Kayıt, Dosya Yükle akışları
- Mevcut upload/report/live recording altyapısı
- Mevcut company members CRUD mantığı

## Maliyet Kontrolü

- Sektörel Radar: Haber tarama yapmaz; kullanıcı gelişmeyi girer, AI sadece yorumlar
- Danışman: Retrieval-first, 8000 char context limiti korunur
- Profil bilgisi hafif metin, her sorguda eklenir (düşük token)
- Geçmiş: Son 10 soru özetlenerek gönderilir

## Manuel Geliştirme Gerektiren Alanlar

- Gerçek zamanlı haber API entegrasyonu (Sektörel Radar için ileride)
- Haftalık otomatik rapor oluşturma
- Company notes'un localStorage'dan DB'ye migration'ı (mevcut kullanıcılar için)

