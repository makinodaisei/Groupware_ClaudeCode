import { useState } from 'react';
import { HashRouter as BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Facility from './pages/Facility';
import Documents from './pages/Documents';
import Admin from './pages/Admin';

function AppLayout() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!user) return <Login />;

  return (
    <div id="app" style={{ display: 'flex' }}>
      <div className="topbar-wrapper" style={{ position:'fixed', top:0, left:0, right:0, zIndex:50 }}>
        <TopBar menuOpen={menuOpen} onMenuToggle={() => setMenuOpen(o => !o)} />
      </div>
      <div className="app-body" style={{ marginTop: 'var(--topbar-h)', width:'100%', display:'flex', height:'calc(100vh - var(--topbar-h))' }}>
        <Sidebar isOpen={menuOpen} onClose={() => setMenuOpen(false)} />
        <main className="main-content">
          <div className="main-inner">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/facility" element={<Facility />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/admin" element={user?.role === 'admin' ? <Admin /> : <Navigate to="/" />} />
              <Route path="/users" element={<Navigate to="/admin" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppLayout />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
