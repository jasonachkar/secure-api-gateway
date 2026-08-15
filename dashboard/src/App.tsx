import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

const Landing = lazy(() =>
  import('./pages/Landing').then((module) => ({ default: module.Landing }))
);
const Login = lazy(() => import('./pages/Login').then((module) => ({ default: module.Login })));
const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((module) => ({ default: module.Dashboard }))
);
const TrafficExplorer = lazy(() =>
  import('./pages/TrafficExplorer').then((module) => ({ default: module.TrafficExplorer }))
);
const Detections = lazy(() =>
  import('./pages/Detections').then((module) => ({ default: module.Detections }))
);
const Investigations = lazy(() =>
  import('./pages/Investigations').then((module) => ({ default: module.Investigations }))
);
const GuidedScenarios = lazy(() =>
  import('./pages/GuidedScenarios').then((module) => ({ default: module.GuidedScenarios }))
);
const CloudCoverage = lazy(() =>
  import('./pages/CloudCoverage').then((module) => ({ default: module.CloudCoverage }))
);
const Compliance = lazy(() =>
  import('./pages/Compliance').then((module) => ({ default: module.Compliance }))
);
const AuditLogs = lazy(() =>
  import('./pages/AuditLogs').then((module) => ({ default: module.AuditLogs }))
);
const Sessions = lazy(() =>
  import('./pages/Sessions').then((module) => ({ default: module.Sessions }))
);
const Users = lazy(() => import('./pages/Users').then((module) => ({ default: module.Users })));
const Threats = lazy(() =>
  import('./pages/Threats').then((module) => ({ default: module.Threats }))
);
const About = lazy(() => import('./pages/About').then((module) => ({ default: module.About })));
const ImplementationStatus = lazy(() =>
  import('./pages/ImplementationStatus').then((module) => ({
    default: module.ImplementationStatus,
  }))
);

function Protected({ children }: { children: ReactElement }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading)
    return (
      <div className="app-loading">
        <span className="app-loading__mark" />{' '}
        <div className="app-loading__text">Connecting to control plane…</div>
      </div>
    );

  const protect = (element: ReactElement) => <Protected>{element}</Protected>;

  return (
    <Suspense
      fallback={
        <div className="app-loading">
          <span className="app-loading__mark" />
          <div className="app-loading__text">Loading workspace…</div>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={isAuthenticated ? <Dashboard /> : <Landing />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />

        <Route path="/traffic" element={protect(<TrafficExplorer />)} />
        <Route path="/detections" element={protect(<Detections />)} />
        <Route path="/investigations" element={protect(<Investigations />)} />
        <Route path="/security-lab" element={protect(<GuidedScenarios />)} />
        <Route path="/guided-scenarios" element={protect(<GuidedScenarios />)} />
        <Route path="/cloud" element={protect(<CloudCoverage />)} />
        <Route path="/cloud-coverage" element={protect(<CloudCoverage />)} />
        <Route path="/compliance" element={protect(<Compliance />)} />
        <Route path="/audit" element={protect(<AuditLogs />)} />
        <Route path="/audit-logs" element={protect(<AuditLogs />)} />
        <Route path="/sessions" element={protect(<Sessions />)} />
        <Route path="/identities" element={protect(<Users />)} />
        <Route path="/users" element={protect(<Users />)} />
        <Route path="/threats" element={protect(<Threats />)} />
        <Route path="/architecture" element={protect(<About />)} />
        <Route path="/about" element={protect(<About />)} />
        <Route path="/implementation-status" element={protect(<ImplementationStatus />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default App;
