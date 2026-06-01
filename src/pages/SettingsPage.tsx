import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/dashboard/PageHeader";
import LoadingState from "@/components/dashboard/LoadingState";
import { useTheme } from "@/hooks/useTheme";
import { Loader2 } from "lucide-react";

const SettingsPage = () => {
  const [profile, setProfile] = useState({ full_name: "", email: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile({ full_name: data?.full_name || "", email: user.email || "" });
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from("profiles").update({ full_name: profile.full_name }).eq("id", user.id);
      toast.success("Profil güncellendi");
    } catch {
      toast.error("Güncelleme hatası");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState message="Ayarlar yükleniyor..." />;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Ayarlar" description="Hesap ve uygulama tercihlerinizi yönetin" />

      {/* Profile */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
        <h2 className="font-display text-sm font-semibold">Profil Bilgileri</h2>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Ad Soyad</Label>
            <Input value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">E-posta</Label>
            <Input value={profile.email} disabled className="h-9 opacity-60" />
          </div>
        </div>
        <Button size="sm" className="text-xs" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          Kaydet
        </Button>
      </div>

      {/* Appearance */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
        <h2 className="font-display text-sm font-semibold">Görünüm</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Koyu Mod</p>
            <p className="text-xs text-muted-foreground">Koyu temayı etkinleştirin</p>
          </div>
          <Switch
            checked={resolvedTheme === "dark"}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
          />
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card space-y-4">
        <h2 className="font-display text-sm font-semibold">Bildirimler</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">E-posta Bildirimleri</p>
            <p className="text-xs text-muted-foreground">Analiz tamamlandığında bildirim alın</p>
          </div>
          <Switch defaultChecked />
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-destructive/20 bg-destructive/[0.02] p-5 shadow-card space-y-3">
        <h2 className="font-display text-sm font-semibold text-destructive">Tehlikeli Bölge</h2>
        <p className="text-xs text-muted-foreground">Hesabınızı sildiğinizde tüm verileriniz kalıcı olarak kaldırılır.</p>
        <Button variant="destructive" size="sm" className="text-xs">Hesabı Sil</Button>
      </div>
    </div>
  );
};

export default SettingsPage;
