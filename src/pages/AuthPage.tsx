import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Bird, Mail, Lock, User, Building2, UserCircle, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<"corporate" | "individual">("individual");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const redirectTo = useMemo(() => {
    const raw = searchParams.get("redirect");
    return raw && raw.startsWith("/") ? raw : null;
  }, [searchParams]);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  const navigateByAccountType = useCallback(async (user: any) => {
    if (redirectTo) {
      navigate(redirectTo, { replace: true });
      return;
    }
    // Check profile for account type
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("id", user.id)
      .single();

    const type = profile?.account_type || user.user_metadata?.account_type || "individual";
    navigate(type === "corporate" ? "/dashboard" : "/individual", { replace: true });
  }, [navigate, redirectTo]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigateByAccountType(data.session.user);
      }
    });
  }, [navigateByAccountType]);

  const getFriendlyError = (err: any) => {
    const msg = (err?.message ?? "").toString();
    if (msg.toLowerCase().includes("invalid login credentials")) return "E-posta veya şifre hatalı.";
    if (msg.toLowerCase().includes("password") && msg.toLowerCase().includes("6")) return "Şifre en az 6 karakter olmalı.";
    return msg || "İşlem başarısız";
  };

  const handleForgotPassword = async () => {
    if (!normalizedEmail) {
      toast.error("Şifre sıfırlama için önce e-postanı yaz");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Şifre sıfırlama e-postası gönderildi");
    } catch (err: any) {
      toast.error(getFriendlyError(err));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalizedEmail || !password || (!isLogin && !name.trim())) {
      toast.error("Lütfen tüm alanları doldurun");
      return;
    }
    if (!isLogin && password.length < 6) {
      toast.error("Şifre en az 6 karakter olmalı");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) throw error;
        toast.success("Giriş başarılı!");
        await navigateByAccountType(data.user);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            name: name.trim(),
            account_type: accountType,
          },
        },
      });

      if (error) throw error;
      toast.success("Kayıt başarılı!");
      if (data.user) {
        await navigateByAccountType(data.user);
      }
    } catch (err: any) {
      toast.error(getFriendlyError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center bg-gradient-surface border-r border-border">
        <div className="absolute inset-0 bg-gradient-glow pointer-events-none" />
        <div className="relative z-10 max-w-md text-center px-8">
          <Bird className="h-16 w-16 text-primary mx-auto mb-6" />
          <h1 className="font-display text-4xl font-bold mb-4">Donebird</h1>
          <p className="text-muted-foreground text-lg">Yapay zeka destekli toplantı ve mülakat analiz platformu</p>
          <div className="mt-12 grid grid-cols-3 gap-6">
            {[
              { value: "10K+", label: "Toplantı" },
              { value: "%94", label: "Doğruluk" },
              { value: "3dk", label: "Rapor" },
            ].map((s) => (
              <div key={s.label}>
                <div className="font-display text-2xl font-bold text-gradient-primary">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex items-center justify-center p-8 relative">
        <Link to="/" className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Ana Sayfa
        </Link>
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <Bird className="h-8 w-8 text-primary" />
            <span className="font-display text-2xl font-bold">Donebird</span>
          </div>

          <h2 className="font-display text-2xl font-bold mb-1">{isLogin ? "Tekrar hoş geldiniz" : "Hesap oluşturun"}</h2>
          <p className="text-muted-foreground text-sm mb-6">{isLogin ? "Hesabınıza giriş yapın" : "Ücretsiz hesabınızı oluşturun"}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Type Selection - only on signup */}
            {!isLogin && (
              <div className="space-y-2">
                <Label>Hesap Türü</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAccountType("corporate")}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      accountType === "corporate"
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <Building2 className={`h-6 w-6 ${accountType === "corporate" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${accountType === "corporate" ? "text-primary" : "text-foreground"}`}>Kurumsal</span>
                    <span className="text-xs text-muted-foreground text-center">Toplantı & mülakat yönetimi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountType("individual")}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      accountType === "individual"
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <UserCircle className={`h-6 w-6 ${accountType === "individual" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${accountType === "individual" ? "text-primary" : "text-foreground"}`}>Bireysel</span>
                    <span className="text-xs text-muted-foreground text-center">Mülakat pratiği & analiz</span>
                  </button>
                </div>
              </div>
            )}

            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="name">Ad Soyad</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="name" placeholder="Adınız Soyadınız" value={name} onChange={(e) => setName(e.target.value)} className="pl-10" />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">E-posta</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="email" type="email" placeholder="ornek@sirket.com" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Şifre</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="pl-10" />
              </div>
              {isLogin && (
                <div className="text-xs text-right">
                  <button type="button" onClick={handleForgotPassword} className="text-primary hover:underline font-medium">
                    Şifremi unuttum
                  </button>
                </div>
              )}
            </div>

            <Button variant="hero" className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Lütfen bekleyin..." : isLogin ? "Giriş Yap" : "Kayıt Ol"}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {isLogin ? "Hesabınız yok mu?" : "Zaten hesabınız var mı?"}{" "}
            <button onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline font-medium" type="button">
              {isLogin ? "Kayıt Ol" : "Giriş Yap"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
