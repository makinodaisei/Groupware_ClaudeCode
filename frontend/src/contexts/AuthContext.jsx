import { createContext, useContext, useState, useEffect } from 'react';
import { setAuthToken, clearAuthToken, setUnauthorizedHandler } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { email, name, role, token }

  function login({ user, token }) {
    setUser({ ...user, token });
    setAuthToken(token);
  }

  function logout() {
    setUser(null);
    clearAuthToken();
  }

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      clearAuthToken();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
