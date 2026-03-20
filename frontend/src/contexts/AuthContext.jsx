import { createContext, useContext, useState } from 'react';
import { setAuthToken, clearAuthToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { email, name, role, token }

  function login(userData) {
    setUser(userData);
    setAuthToken(userData.token);
  }

  function logout() {
    setUser(null);
    clearAuthToken();
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
