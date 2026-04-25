import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AuthUser, LoginRequest, RegisterRequest } from '@/types';
import { authApi } from '@/services/api';
import { setTokens, clearTokens, getAccessToken } from '@/lib/apiClient';

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, try to restore session from stored token
  useEffect(() => {
    const token = getAccessToken();
    if (!token) { setIsLoading(false); return; }
    authApi.me()
      .then((u: AuthUser) => setUser(u))
      .catch(() => clearTokens())
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (req: LoginRequest) => {
    const tokens = await authApi.login(req);
    setTokens(tokens);
    const me = await authApi.me();
    setUser(me);
  }, []);

  const register = useCallback(async (req: RegisterRequest) => {
    await authApi.register(req);
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    clearTokens();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
