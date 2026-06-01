import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRecoveryFlow = useMemo(() => {
    const hash = window.location.hash?.startsWith("#") ? window.location.hash.slice(1) : "";
    const params = new URLSearchParams(hash);
    return params.get("type") === "recovery";
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || password.length < 6) {
      toast.error("Şifre en az 6 karakter olmalı");
      return;
    }

    if (password !== password2) {
      toast.error("Şifreler eşleşmiyor");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Şifren güncellendi");
      navigate("/dashboard", { replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Şifre güncellenemedi");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-2xl font-bold mb-1">Yeni Şifre Belirle</h1>
        <p className="text-muted-foreground text-sm mb-6">
          {isRecoveryFlow
            ? "Yeni şifreni belirle ve hesabına tekrar giriş yap."
            : "Bu sayfa sadece şifre sıfırlama e-postasından gelen link ile kullanılabilir."}
        </p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Yeni Şifre</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={!isRecoveryFlow}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password2">Yeni Şifre (Tekrar)</Label>
            <Input
              id="password2"
              type="password"
              placeholder="••••••••"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              disabled={!isRecoveryFlow}
            />
          </div>

          <Button type="submit" variant="hero" className="w-full" disabled={!isRecoveryFlow || isSubmitting}>
            {isSubmitting ? "Güncelleniyor..." : "Şifreyi Güncelle"}
          </Button>

          <Button type="button" variant="ghost" className="w-full" onClick={() => navigate("/auth", { replace: true })}>
            Giriş sayfasına dön
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
