import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import Drawer from '../components/Drawer';

export default function Users() {
  const showToast = useToast();
  const [users, setUsers] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  async function loadUsers() {
    try {
      const data = await api('GET', '/users');
      setUsers(data.users || []);
    } catch {
      setUsers([]);
      showToast('ユーザーの取得に失敗しました', 'error');
    }
  }

  useEffect(() => { loadUsers(); }, []);

  async function handleInvite(fd) {
    if (!fd.email?.trim()) throw 'メールアドレスを入力してください';
    if (!fd.name?.trim()) throw '表示名を入力してください';
    const res = await api('POST', '/users', { email: fd.email.trim(), name: fd.name.trim(), role: fd.role || 'user' });
    if (res.error) throw res.message || 'エラーが発生しました';
    showToast('招待メールを送信しました', 'success');
    loadUsers();
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>ユーザー管理</h2>
        <button className="btn btn-primary" onClick={() => setDrawerOpen(true)}>＋ ユーザー招待</button>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr><th>名前</th><th>メール</th><th>ロール</th><th>ステータス</th></tr>
          </thead>
          <tbody>
            {users === null ? (
              <tr><td colSpan={4}><div className="skeleton skeleton-row" /></td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>ユーザーなし</td></tr>
            ) : users.map(u => (
              <tr key={u.userId || u.email}>
                <td>{u.name}</td>
                <td style={{ color: 'var(--color-text-muted)' }}>{u.email}</td>
                <td><span className={`badge ${u.role === 'admin' ? 'badge-orange' : 'badge-blue'}`}>{u.role}</span></td>
                <td><span className={`badge ${u.enabled ? 'badge-green' : 'badge-gray'}`}>{u.status || (u.enabled ? '有効' : '無効')}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Drawer isOpen={drawerOpen} title="ユーザーを招待" onClose={() => setDrawerOpen(false)} onSubmit={handleInvite}>
        <div className="field">
          <label>メールアドレス <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="email" name="email" placeholder="user@example.com" />
        </div>
        <div className="field">
          <label>表示名 <span style={{ color: 'var(--color-danger)' }}>*</span></label>
          <input type="text" name="name" placeholder="山田 太郎" />
        </div>
        <div className="field">
          <label>ロール</label>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'normal', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input type="radio" name="role" value="user" defaultChecked /> 一般ユーザー
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 'normal', fontSize: '0.875rem', cursor: 'pointer' }}>
              <input type="radio" name="role" value="admin" /> 管理者
            </label>
          </div>
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>招待メールが指定のアドレスに送信されます。</p>
      </Drawer>
    </div>
  );
}
