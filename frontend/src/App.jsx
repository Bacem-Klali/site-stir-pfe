import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  // 1. Wait for the token to be verified before doing anything
  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Chargement...</div>; 
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const { isAuthenticated, user, isLoading } = useAuth();

  // 2. Wait here too
  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Chargement...</div>;
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  
  // Make sure the role check is case-insensitive just in case
  const hasAccess = ['owner', 'admin'].includes(user?.role?.toLowerCase());
  
  if (!hasAccess) return <Navigate to="/dashboard" replace />;
  
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={
            <ProtectedRoute><DashboardPage /></ProtectedRoute>
          } />
          <Route path="/admin" element={
            <AdminRoute><AdminPage /></AdminRoute>
          } />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}