/**
 * App component with routing
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { About } from './pages/About';
import { AuditLogs } from './pages/AuditLogs';
import { Sessions } from './pages/Sessions';
import { Users } from './pages/Users';
import { Threats } from './pages/Threats';
import { Incidents } from './pages/Incidents';
import { Compliance } from './pages/Compliance';
import { GuidedScenarios } from './pages/GuidedScenarios';
import { Investigations } from './pages/Investigations';
import { CloudCoverage } from './pages/CloudCoverage';
import { ImplementationStatus } from './pages/ImplementationStatus';

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="app-loading__text">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={isAuthenticated ? <Dashboard /> : <Landing />}
        />
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
        />
        <Route
          path="/about"
          element={isAuthenticated ? <About /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/audit-logs"
          element={isAuthenticated ? <AuditLogs /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/sessions"
          element={isAuthenticated ? <Sessions /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/users"
          element={isAuthenticated ? <Users /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/threats"
          element={isAuthenticated ? <Threats /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/incidents"
          element={isAuthenticated ? <Incidents /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/compliance"
          element={isAuthenticated ? <Compliance /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/guided-scenarios"
          element={isAuthenticated ? <GuidedScenarios /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/investigations"
          element={isAuthenticated ? <Investigations /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/cloud-coverage"
          element={isAuthenticated ? <CloudCoverage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/implementation-status"
          element={isAuthenticated ? <ImplementationStatus /> : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
