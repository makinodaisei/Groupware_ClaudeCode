import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function TopBar() {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="topbar">
      <div className="topbar-logo">🏢</div>
      <div className="topbar-title">社内グループウェア</div>
      <div className="topbar-spacer" />
      <div className="topbar-user" onClick={() => setDropdownOpen(o => !o)}>
        <div className="topbar-avatar">{initial}</div>
        <span>{user?.name || user?.email}</span>
        <span>▾</span>
        {dropdownOpen && (
          <div className="topbar-dropdown open">
            <div className="topbar-dropdown-item danger" onClick={logout}>
              🚪 ログアウト
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
