import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AppSidebar from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";

const DashboardLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const didRedirectRef = useRef(false);
  const redirectPath = `${location.pathname}${location.search}${location.hash}`;

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

    return () => { authListener.subscription.unsubscribe(); };
  }, [navigate, redirectPath]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="lg:ml-60 min-h-screen pt-14 lg:pt-0">
        <div className="max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
