import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardLayout from "./pages/DashboardLayout";
import DashboardHome from "./pages/DashboardHome";
import ExecutiveOverviewPage from "./pages/ExecutiveOverviewPage";
import MeetingsPage from "./pages/MeetingsPage";
import MeetingDetailPage from "./pages/MeetingDetailPage";
// UploadPage merged into RecordPage
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import RecordPage from "./pages/RecordPage";
import CompanyPage from "./pages/CompanyPage";
import CompanyAdvisorPage from "./pages/CompanyAdvisorPage";
import CompanyProfilePage from "./pages/CompanyProfilePage";
import SectorRadarPage from "./pages/SectorRadarPage";
import MemberDetailPage from "./pages/MemberDetailPage";
import ReportsPage from "./pages/ReportsPage";
import BillingPage from "./pages/BillingPage";
// ZoomImportPage removed — Zoom is now integrated into RecordPage
import IndividualLayout from "./pages/IndividualLayout";
import IndividualHome from "./pages/IndividualHome";
import PracticeInterviewPage from "./pages/PracticeInterviewPage";
import PracticeHistoryPage from "./pages/PracticeHistoryPage";
import PracticeDetailPage from "./pages/PracticeDetailPage";
import CharacterAnalysisPage from "./pages/CharacterAnalysisPage";
import AICareerCoachPage from "./pages/AICareerCoachPage";
import CareerProfilePage from "./pages/CareerProfilePage";
import DailyTrainingPage from "./pages/DailyTrainingPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/* Corporate Dashboard */}
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardHome />} />
            <Route path="record" element={<RecordPage />} />
            <Route path="biveyos" element={<Navigate to="/dashboard/record" replace />} />
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
            <Route path="integrations" element={<Navigate to="/dashboard/settings" replace />} />
            <Route path="billing" element={<BillingPage />} />
            {/* zoom-import route removed — merged into /dashboard/record */}
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          {/* Individual Dashboard */}
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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
