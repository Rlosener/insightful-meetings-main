import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Bird, LayoutDashboard, Video, BarChart3, Settings, LogOut,
  Camera, Building2, Menu, X, FileText, CreditCard, Sun, Moon,
  User, Brain, Radar, UserCircle, TrendingUp, Plug
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/useTheme";

type SidebarItem = {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  end?: boolean;
};

const mainNav: SidebarItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Kontrol Paneli", end: true },
  { to: "/dashboard/executive", icon: BarChart3, label: "Yönetici Özeti" },
  { to: "/dashboard/record", icon: Camera, label: "Kayıt ve Analiz" },
  { to: "/dashboard/meetings", icon: Video, label: "Toplantılar" },
];

const companyNav: SidebarItem[] = [
  { to: "/dashboard/company", icon: Building2, label: "Ekip ve Kişiler" },
  { to: "/dashboard/company/profile", icon: UserCircle, label: "Şirket Profili" },
  { to: "/dashboard/company/radar", icon: Radar, label: "Sektör Radarı" },
];

const insightNav: SidebarItem[] = [
  { to: "/dashboard/advisor", icon: Brain, label: "AI Şirket Danışmanı" },
  { to: "/dashboard/analytics", icon: TrendingUp, label: "Analitik" },
  { to: "/dashboard/reports", icon: FileText, label: "Raporlar" },
];

const systemNav: SidebarItem[] = [
  { to: "/dashboard/integrations", icon: Plug, label: "Entegrasyonlar" },
  { to: "/dashboard/billing", icon: CreditCard, label: "Faturalandırma" },
  { to: "/dashboard/settings", icon: Settings, label: "Ayarlar" },
];

const SidebarSection = ({ title, items, closeMobile }: { title: string; items: SidebarItem[]; closeMobile: () => void }) => (
  <div className="space-y-0.5">
    <p className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{title}</p>
    {items.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end || false}
        onClick={closeMobile}
        className={({ isActive }) =>
          `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150 ${
            isActive
              ? "bg-primary/10 text-primary shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
          }`
        }
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </NavLink>
    ))}
  </div>
);

const AppSidebar = () => {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserName(data.user?.user_metadata?.name || data.user?.email?.split("@")[0] || "Kullanıcı");
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Çıkış yapıldı");
    navigate("/auth");
  };

  const closeMobile = () => setMobileOpen(false);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bird className="h-4 w-4 text-primary" />
          </div>
          <span className="font-display text-sm font-bold tracking-tight">Donebird</span>
        </div>
        <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 rounded-md hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-1 overflow-y-auto space-y-0.5">
        <SidebarSection title="Ana Menü" items={mainNav} closeMobile={closeMobile} />
        <SidebarSection title="Şirket" items={companyNav} closeMobile={closeMobile} />
        <SidebarSection title="İçgörü" items={insightNav} closeMobile={closeMobile} />
        <SidebarSection title="Sistem" items={systemNav} closeMobile={closeMobile} />
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border space-y-2 shrink-0">
        {/* Theme toggle */}
        <button
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors w-full"
        >
          {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {resolvedTheme === "dark" ? "Açık Mod" : "Koyu Mod"}
        </button>

        {/* User */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/50">
          <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{userName}</p>
            <p className="text-[10px] text-muted-foreground">Kurumsal</p>
          </div>
          <button onClick={handleLogout} className="p-1 rounded hover:bg-muted" title="Çıkış Yap">
            <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
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

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-background/60 backdrop-blur-sm z-50" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 w-60 border-r border-border bg-card flex flex-col z-50 transition-transform duration-200 ease-out
          lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
