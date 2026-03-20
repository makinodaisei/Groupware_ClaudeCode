import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { cognitoLogin } from '../lib/auth';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userData = await cognitoLogin(email, password);
      login(userData);
    } catch (err) {
      setError(typeof err === 'string' ? err : 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="login-screen">
      <div className="login-left">
        <div className="login-left-logo">🏢</div>
        <div className="login-left-title">社内グループウェア</div>
        <div className="login-left-sub">Your company workspace</div>
      </div>
      <div className="login-right">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>ログイン</h2>
          <p>アカウント情報を入力してください</p>
          <div className="form-group">
            <label htmlFor="email">メールアドレス</label>
            <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="password">パスワード</label>
            <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <div className="login-error" style={{ display: 'block' }}>{error}</div>}
          <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop: '1rem' }}>
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
