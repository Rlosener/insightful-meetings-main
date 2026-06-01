import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, NavLink } from "react-router-dom";
import { Bird, LayoutDashboard, Mic, History, BarChart3, Settings, LogOut, Menu, X, Sun, Moon, User, Brain, Zap } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/useTheme";

const navItems = [
  { to: "/individual", icon: LayoutDashboard, label: "Panel", end: true },
  { to: "/individual/daily", icon: Zap, label: "Günlük Eğitim" },
  { to: "/individual/practice", icon: Mic, label: "Pratik Mülakat" },
  { to: "/individual/history", icon: History, label: "Geçmiş" },
  { to: "/individual/coach", icon: Brain, label: "AI Kariyer Koçu" },
  { to: "/individual/profile", icon: User, label: "Kariyer Profili" },
  { to: "/individual/analysis", icon: BarChart3, label: "Karakter Analizi" },
  { to: "/individual/settings", icon: Settings, label: "Ayarlar" },
];

const IndividualLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const didRedirectRef = useRef(false);
  const redirectPath = `${location.pathname}${location.search}${location.hash}`;
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !didRedirectRef.current) {
        didRedirectRef.current = true;
        navigate(`/auth?redirect=${encodeURIComponent(redirectPath)}`, { replace: true });
        return;
      }
      if (session) setReady(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!data.session && !didRedirectRef.current) {
        didRedirectRef.current = true;
        navigate(`/auth?redirect=${encodeURIComponent(redirectPath)}`, { replace: true });
        return;
      }
      if (data.session) setReady(true);
    });

    supabase.auth.getUser().then(({ data }) => {
      setUserName(data.user?.user_metadata?.name || data.user?.email?.split("@")[0] || "Kullanıcı");
    });

    return () => { authListener.subscription.unsubscribe(); };
  }, [navigate, redirectPath]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Çıkış yapıldı");
    navigate("/auth");
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bird className="h-4 w-4 text-primary" />
          </div>
          <span className="font-display text-sm font-bold tracking-tight">Donebird</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold uppercase tracking-wider">Bireysel</span>
        </div>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 rounded-md hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                isActive ? "bg-primary/10 text-primary shadow-xs" : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-border space-y-2 shrink-0">
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors w-full"
        >
          {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {resolvedTheme === "dark" ? "Açık Mod" : "Koyu Mod"}
        </button>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/50">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{userName}</p>
            <p className="text-[10px] text-muted-foreground">Bireysel</p>
          </div>
          <button onClick={handleLogout} className="p-1 rounded hover:bg-muted" title="Çıkış Yap">
            <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card/80 backdrop-blur-xl border-b border-border flex items-center px-4 z-50">
        <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-muted -ml-2">
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 ml-2">
          <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
            <Bird className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-display text-sm font-bold">Donebird</span>
        </div>
      </div>

      {mobileOpen && <div className="lg:hidden fixed inset-0 bg-background/60 backdrop-blur-sm z-50" onClick={() => setMobileOpen(false)} />}

      <aside className={`fixed top-0 bottom-0 left-0 w-60 border-r border-border bg-card flex flex-col z-50 transition-transform duration-200 ease-out lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        {sidebarContent}
      </aside>

      <main className="lg:ml-60 min-h-screen pt-14 lg:pt-0">
        <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default IndividualLayout;
