import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import RoomListPage from './pages/RoomListPage';
import RoomDashboardPage from './pages/RoomDashboardPage';
import AddExpensePage from './pages/AddExpensePage';
import EditExpensePage from './pages/EditExpensePage';
import ExpenseHistoryPage from './pages/ExpenseHistoryPage';
import ExpenseDetailPage from './pages/ExpenseDetailPage';
import SettlementPage from './pages/SettlementPage';
import RoomSettingsPage from './pages/RoomSettingsPage';
import MonthlySummaryPage from './pages/MonthlySummaryPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAuth();
  if (loading) return <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spinner" /></div>;
  if (!token) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AppRoutes() {
  const { token, loading } = useAuth();
  if (loading) return <div className="app-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="loading-spinner" /></div>;

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/rooms" /> : <LoginPage />} />
      <Route path="/register" element={token ? <Navigate to="/rooms" /> : <RegisterPage />} />
      
      <Route path="/rooms" element={<ProtectedRoute><RoomListPage /></ProtectedRoute>} />
      <Route path="/rooms/:roomId" element={<ProtectedRoute><RoomDashboardPage /></ProtectedRoute>} />
      <Route path="/rooms/:roomId/add-expense" element={<ProtectedRoute><AddExpensePage /></ProtectedRoute>} />
      <Route path="/rooms/:roomId/edit-expense/:expenseId" element={<ProtectedRoute><EditExpensePage /></ProtectedRoute>} />
      <Route path="/rooms/:roomId/history" element={<ProtectedRoute><ExpenseHistoryPage /></ProtectedRoute>} />
      <Route path="/rooms/:roomId/expenses/:expenseId" element={<ProtectedRoute><ExpenseDetailPage /></ProtectedRoute>} />
      <Route path="/rooms/:roomId/settle" element={<ProtectedRoute><SettlementPage /></ProtectedRoute>} />
      <Route path="/rooms/:roomId/settings" element={<ProtectedRoute><RoomSettingsPage /></ProtectedRoute>} />
      <Route path="/rooms/:roomId/summary" element={<ProtectedRoute><MonthlySummaryPage /></ProtectedRoute>} />

      <Route path="/" element={<Navigate to={token ? "/rooms" : "/login"} />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
