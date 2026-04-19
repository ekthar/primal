import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Toaster } from "@/components/ui/sonner";

import AppShell from "@/components/layout/AppShell";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ApplicantDashboard from "@/pages/ApplicantDashboard";
import ClubDashboard from "@/pages/ClubDashboard";
import AdminQueue from "@/pages/AdminQueue";
import ReviewerWorkbench from "@/pages/ReviewerWorkbench";
import Appeals from "@/pages/Appeals";
import Reports from "@/pages/Reports";

function Protected({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="App font-sans">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              <Route element={<Protected><AppShell /></Protected>}>
                <Route path="/applicant" element={<ApplicantDashboard />} />
                <Route path="/club" element={<ClubDashboard />} />
                <Route path="/admin/queue" element={<AdminQueue />} />
                <Route path="/admin/review/:id" element={<ReviewerWorkbench />} />
                <Route path="/admin/review" element={<ReviewerWorkbench />} />
                <Route path="/admin/appeals" element={<Appeals />} />
                <Route path="/admin/reports" element={<Reports />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster position="bottom-right" />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
