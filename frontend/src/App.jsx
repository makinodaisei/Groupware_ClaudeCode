import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './components/Toast';
import TopBar from './components/TopBar';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Facility from './pages/Facility';
import Documents from './pages/Documents';
import Users from './pages/Users';

function AppLayout() {
  const { user } = useAuth();
  if (!user) return <Login />;

  return (
    <div id="app" style={{ display: 'flex' }}>
      <div className="topbar-wrapper" style={{ position:'fixed', top:0, left:0, right:0, zIndex:50 }}>
        <TopBar />
      </div>
      <div className="app-body" style={{ marginTop: 'var(--topbar-h)', width:'100%', display:'flex', height:'calc(100vh - var(--topbar-h))' }}>
        <Sidebar />
        <main className="main-content">
          <div className="main-inner">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/facility" element={<Facility />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/users" element={user?.role === 'admin' ? <Users /> : <Navigate to="/" />} />
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
