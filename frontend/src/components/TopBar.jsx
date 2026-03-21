import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function TopBar({ menuOpen, onMenuToggle }) {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const initial = (user?.name || user?.email || '?').charAt(0).toUpperCase();

  return (
    <div className="topbar">
      {/* Hamburger — mobile only */}
      <button
        type="button"
        className="topbar-hamburger"
        onClick={onMenuToggle}
        aria-label="メニューを開く"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div className="topbar-logo">G</div>
      <div className="topbar-title">社内グループウェア</div>
      <div className="topbar-spacer" />
      <div className="topbar-user" onClick={() => setDropdownOpen(o => !o)}>
        <div className="topbar-avatar">{initial}</div>
        <span>{user?.name || user?.email}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ marginLeft: 2 }}><path d="M0 3l5 5 5-5z"/></svg>
        {dropdownOpen && (
          <div className="topbar-dropdown open">
            <div className="topbar-dropdown-item danger" onClick={logout}>
              ログアウト
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
