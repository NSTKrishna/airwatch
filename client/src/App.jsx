import { lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from './lib/auth.jsx';
import { Skeleton } from './components/ui.jsx';
import PublicLayout from './components/PublicLayout.jsx';
import MunicipalLayout from './components/MunicipalLayout.jsx';
import { Login, Register } from './pages/Auth.jsx';

const MapHome = lazy(() => import('./pages/public/MapHome.jsx'));
const ProjectPanel = lazy(() => import('./pages/public/ProjectPanel.jsx'));
const ReportPanel = lazy(() => import('./pages/public/ReportPanel.jsx'));
const WardPanel = lazy(() => import('./pages/public/WardPanel.jsx'));
const Methodology = lazy(() => import('./pages/public/Methodology.jsx'));
const Track = lazy(() => import('./pages/public/Track.jsx'));
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
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  // A signed-in user on the other role's area is sent to their own home. The API enforces this independently.
  if (user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      {/* The map and everything on it are public. Filing and "my reports" need a citizen account. */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<MapHome />}>
          <Route path="project/:code" element={<ProjectPanel />} />
          <Route path="report/:reference" element={<ReportPanel />} />
          <Route path="ward/:slug" element={<WardPanel />} />
        </Route>
        <Route path="/track" element={<Track />} />
        <Route path="/methodology" element={<Methodology />} />
        <Route path="/citizen" element={<Navigate to="/" replace />} />
        <Route element={<RequireRole role="CITIZEN" />}>
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
