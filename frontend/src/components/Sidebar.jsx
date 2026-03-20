import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', icon: '🏠', title: 'ダッシュボード', id: 'dashboard' },
  { path: '/schedule', icon: '📅', title: 'スケジュール', id: 'schedule' },
  { path: '/facility', icon: '🏢', title: '施設予約', id: 'facility' },
  { path: '/documents', icon: '📁', title: '文書管理', id: 'documents' },
];

export default function Sidebar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="sidebar">
      {NAV_ITEMS.map(item => (
        <div
          key={item.id}
          className={`sidebar-icon ${location.pathname === item.path ? 'active' : ''}`}
          title={item.title}
          onClick={() => navigate(item.path)}
        >
          {item.icon}
        </div>
      ))}
      <div className="sidebar-spacer" />
      {user?.role === 'admin' && (
        <div
          className={`sidebar-icon ${location.pathname === '/users' ? 'active' : ''}`}
          title="ユーザー管理"
          onClick={() => navigate('/users')}
        >
          👥
        </div>
      )}
    </div>
  );
}
