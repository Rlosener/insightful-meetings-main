import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const DashboardLayout = lazy(() => import("./pages/DashboardLayout"));
const DashboardHome = lazy(() => import("./pages/DashboardHome"));
const ExecutiveOverviewPage = lazy(() => import("./pages/ExecutiveOverviewPage"));
const MeetingsPage = lazy(() => import("./pages/MeetingsPage"));
const MeetingDetailPage = lazy(() => import("./pages/MeetingDetailPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const RecordPage = lazy(() => import("./pages/RecordPage"));
const IntegrationsPage = lazy(() => import("./pages/IntegrationsPage"));
const CompanyPage = lazy(() => import("./pages/CompanyPage"));
const CompanyAdvisorPage = lazy(() => import("./pages/CompanyAdvisorPage"));
const CompanyProfilePage = lazy(() => import("./pages/CompanyProfilePage"));
const SectorRadarPage = lazy(() => import("./pages/SectorRadarPage"));
const MemberDetailPage = lazy(() => import("./pages/MemberDetailPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const IndividualLayout = lazy(() => import("./pages/IndividualLayout"));
const IndividualHome = lazy(() => import("./pages/IndividualHome"));
const PracticeInterviewPage = lazy(() => import("./pages/PracticeInterviewPage"));
const PracticeHistoryPage = lazy(() => import("./pages/PracticeHistoryPage"));
const PracticeDetailPage = lazy(() => import("./pages/PracticeDetailPage"));
const CharacterAnalysisPage = lazy(() => import("./pages/CharacterAnalysisPage"));
const AICareerCoachPage = lazy(() => import("./pages/AICareerCoachPage"));
const CareerProfilePage = lazy(() => import("./pages/CareerProfilePage"));
const DailyTrainingPage = lazy(() => import("./pages/DailyTrainingPage"));

const queryClient = new QueryClient();

const RouteFallback = () => (
  <div className="flex min-h-[40vh] items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<DashboardHome />} />
              <Route path="record" element={<RecordPage />} />
              <Route path="biveyos" element={<Navigate to="/dashboard/record" replace />} />
              <Route path="upload" element={<Navigate to="/dashboard/record?mode=file" replace />} />
              <Route path="zoom-import" element={<Navigate to="/dashboard/record?mode=zoom" replace />} />
              <Route path="meetings" element={<MeetingsPage />} />
              <Route path="meetings/:id" element={<MeetingDetailPage />} />
              <Route path="company" element={<CompanyPage />} />
              <Route path="company/profile" element={<CompanyProfilePage />} />
              <Route path="company/radar" element={<SectorRadarPage />} />
              <Route path="company/:memberId" element={<MemberDetailPage />} />
              <Route path="advisor" element={<CompanyAdvisorPage />} />
              <Route path="executive" element={<ExecutiveOverviewPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="integrations" element={<IntegrationsPage />} />
              <Route path="billing" element={<BillingPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="/individual" element={<IndividualLayout />}>
              <Route index element={<IndividualHome />} />
              <Route path="practice" element={<PracticeInterviewPage />} />
              <Route path="history" element={<PracticeHistoryPage />} />
              <Route path="history/:id" element={<PracticeDetailPage />} />
              <Route path="daily" element={<DailyTrainingPage />} />
              <Route path="coach" element={<AICareerCoachPage />} />
              <Route path="profile" element={<CareerProfilePage />} />
              <Route path="analysis" element={<CharacterAnalysisPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
