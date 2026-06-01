import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Building2, Save, Loader2, Factory, Globe, MapPin,
  DollarSign, AlertTriangle, Link2, Briefcase, X,
} from "lucide-react";
import PageHeader from "@/components/dashboard/PageHeader";

interface CompanyProfile {
  id?: string;
  company_name: string;
  sector: string;
  sub_sector: string;
  products_services: string[];
  import_structure: string;
  export_structure: string;
  target_markets: string[];
  operation_cities: string[];
  critical_cost_items: string[];
  strategic_risks: string[];
  supply_dependencies: string[];
  operation_type: string;
  notes: string;
}

const EMPTY_PROFILE: CompanyProfile = {
  company_name: "", sector: "", sub_sector: "",
  products_services: [], import_structure: "", export_structure: "",
  target_markets: [], operation_cities: [],
  critical_cost_items: [], strategic_risks: [],
  supply_dependencies: [], operation_type: "", notes: "",
};

const TagInput = ({ label, icon: Icon, tags, onChange, placeholder }: {
  label: string; icon: any; tags: string[]; onChange: (t: string[]) => void; placeholder: string;
}) => {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) { onChange([...tags, v]); setInput(""); }
  };
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5 text-xs"><Icon className="h-3.5 w-3.5 text-primary" /> {label}</Label>
      <div className="flex gap-2">
        <Input value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }} className="text-sm" />
        <Button type="button" variant="secondary" size="sm" onClick={add}>Ekle</Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t, i) => (
            <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
              {t}
              <button onClick={() => onChange(tags.filter((_, j) => j !== i))} className="hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};

const CompanyProfilePage = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isNew, setIsNew] = useState(true);

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      const { data, error } = await supabase
        .from("company_profiles" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data && !error) {
        const d = data as any;
        setProfile({
          id: d.id,
          company_name: d.company_name || "",
          sector: d.sector || "",
          sub_sector: d.sub_sector || "",
          products_services: d.products_services || [],
          import_structure: d.import_structure || "",
          export_structure: d.export_structure || "",
          target_markets: d.target_markets || [],
          operation_cities: d.operation_cities || [],
          critical_cost_items: d.critical_cost_items || [],
          strategic_risks: d.strategic_risks || [],
          supply_dependencies: d.supply_dependencies || [],
          operation_type: d.operation_type || "",
          notes: d.notes || "",
        });
        setIsNew(false);
      }
    } catch (e) {
      console.error("Profile fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");

      const payload = {
        user_id: user.id,
        company_name: profile.company_name || null,
        sector: profile.sector || null,
        sub_sector: profile.sub_sector || null,
        products_services: profile.products_services,
        import_structure: profile.import_structure || null,
        export_structure: profile.export_structure || null,
        target_markets: profile.target_markets,
        operation_cities: profile.operation_cities,
        critical_cost_items: profile.critical_cost_items,
        strategic_risks: profile.strategic_risks,
        supply_dependencies: profile.supply_dependencies,
        operation_type: profile.operation_type || null,
        notes: profile.notes || null,
        updated_at: new Date().toISOString(),
      };

      if (isNew) {
        const { error } = await supabase.from("company_profiles" as any).insert(payload as any);
        if (error) throw error;
        setIsNew(false);
      } else {
        const { error } = await supabase.from("company_profiles" as any).update(payload as any).eq("user_id", user.id);
        if (error) throw error;
      }

      toast.success("Şirket profili kaydedildi");
    } catch (e: any) {
      toast.error("Kayıt hatası: " + (e.message || "Bilinmeyen hata"));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof CompanyProfile, val: any) => setProfile(p => ({ ...p, [key]: val }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Şirket Profili"
        description="Şirketinizin stratejik bilgilerini tanımlayın. Bu veriler AI Danışman ve Sektörel Radar tarafından kullanılır."
      />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Basic Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" /> Temel Bilgiler
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Şirket Adı</Label>
              <Input value={profile.company_name} onChange={e => set("company_name", e.target.value)} placeholder="Acme Ltd." className="text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Sektör</Label>
                <Input value={profile.sector} onChange={e => set("sector", e.target.value)} placeholder="Demir-Çelik" className="text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Alt Sektör</Label>
                <Input value={profile.sub_sector} onChange={e => set("sub_sector", e.target.value)} placeholder="Hurda İşleme" className="text-sm" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Operasyon Tipi</Label>
              <Input value={profile.operation_type} onChange={e => set("operation_type", e.target.value)} placeholder="Üretim, Ticaret, Hizmet..." className="text-sm" />
            </div>
          </CardContent>
        </Card>

        {/* Trade */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" /> İthalat / İhracat
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">İthalat Yapısı</Label>
              <Textarea value={profile.import_structure} onChange={e => set("import_structure", e.target.value)}
                placeholder="Hurda, enerji, yarı mamul..." rows={3} className="text-sm resize-none" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">İhracat Yapısı</Label>
              <Textarea value={profile.export_structure} onChange={e => set("export_structure", e.target.value)}
                placeholder="Mamul ürün, profil, boru..." rows={3} className="text-sm resize-none" />
            </div>
          </CardContent>
        </Card>

        {/* Tags Sections */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Factory className="h-4 w-4 text-primary" /> Ürünler & Pazarlar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <TagInput label="Ürün / Hizmet Grupları" icon={Briefcase} tags={profile.products_services}
              onChange={v => set("products_services", v)} placeholder="Profil, Boru, Sac" />
            <TagInput label="Hedef Pazarlar / Ülkeler" icon={Globe} tags={profile.target_markets}
              onChange={v => set("target_markets", v)} placeholder="Belçika, ABD, Almanya" />
            <TagInput label="Faaliyet Şehirleri" icon={MapPin} tags={profile.operation_cities}
              onChange={v => set("operation_cities", v)} placeholder="İstanbul, Bursa, İzmir" />
          </CardContent>
        </Card>

        {/* Risks & Costs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-primary" /> Maliyet & Risk
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <TagInput label="Kritik Maliyet Kalemleri" icon={DollarSign} tags={profile.critical_cost_items}
              onChange={v => set("critical_cost_items", v)} placeholder="Enerji, Mazot, Hurda" />
            <TagInput label="Stratejik Riskler" icon={AlertTriangle} tags={profile.strategic_risks}
              onChange={v => set("strategic_risks", v)} placeholder="Kur riski, Enerji maliyeti" />
            <TagInput label="Tedarik Bağımlılıkları" icon={Link2} tags={profile.supply_dependencies}
              onChange={v => set("supply_dependencies", v)} placeholder="Çin hurda, Rusya enerji" />
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Genel Notlar</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={profile.notes} onChange={e => set("notes", e.target.value)}
            placeholder="Stratejik notlar, hedefler, planlar..." rows={4} className="text-sm resize-none" />
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button variant="hero" onClick={saveProfile} disabled={saving} className="min-w-[160px]">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Profili Kaydet
        </Button>
      </div>
    </div>
  );
};

export default CompanyProfilePage;
