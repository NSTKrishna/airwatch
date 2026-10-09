import { Suspense, lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from './lib/auth.jsx';
import { Skeleton } from './components/ui.jsx';
import CitizenLayout from './components/CitizenLayout.jsx';
import MunicipalLayout from './components/MunicipalLayout.jsx';
import { Login, Register } from './pages/Auth.jsx';

const CitizenDashboard = lazy(() => import('./pages/citizen/Dashboard.jsx'));
const ReportForm = lazy(() => import('./pages/citizen/Report.jsx'));
const MyComplaints = lazy(() => import('./pages/citizen/Complaints.jsx'));
const ComplaintDetail = lazy(() => import('./pages/citizen/ComplaintDetail.jsx'));
const Overview = lazy(() => import('./pages/municipal/Overview.jsx'));
const Inbox = lazy(() => import('./pages/municipal/Inbox.jsx'));
const CaseFile = lazy(() => import('./pages/municipal/CaseFile.jsx'));
const Analytics = lazy(() => import('./pages/municipal/Analytics.jsx'));
const Simulator = lazy(() => import('./pages/municipal/Simulator.jsx'));
const Devices = lazy(() => import('./pages/municipal/Devices.jsx'));

function RequireRole({ role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="mx-auto max-w-3xl space-y-3 p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-40" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // A signed-in user on the other role's area is sent to their own home. The API enforces this independently.
  if (user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return <Outlet />;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<RequireRole role="CITIZEN" />}>
        <Route element={<CitizenLayout />}>
          <Route path="/citizen" element={<CitizenDashboard />} />
          <Route path="/citizen/report" element={<ReportForm />} />
          <Route path="/citizen/complaints" element={<MyComplaints />} />
          <Route path="/citizen/complaints/:id" element={<ComplaintDetail />} />
        </Route>
      </Route>
      <Route element={<RequireRole role="MUNICIPAL" />}>
        <Route element={<MunicipalLayout />}>
          <Route path="/municipal" element={<Overview />} />
          <Route path="/municipal/complaints" element={<Inbox />} />
          <Route path="/municipal/complaints/:id" element={<CaseFile />} />
          <Route path="/municipal/analytics" element={<Analytics />} />
          <Route path="/municipal/devices" element={<Devices />} />
          <Route path="/municipal/simulator" element={<Simulator />} />
        </Route>
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
