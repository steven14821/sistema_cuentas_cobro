import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { API_BASE, apiFetch } from '../lib/api';

// Re-export for contexts that import directly from this module.
export { API_BASE };

export type Role = 'admin' | 'technician';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  name: string;
  sede?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  initialized: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const STORAGE_KEY = 'em_auth_user';
const TOKEN_KEY = 'em_auth_token';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [initialized, setInitialized] = useState(false);

  const hydrate = useCallback(async () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const token = localStorage.getItem(TOKEN_KEY);
      if (raw && token) {
        const parsed = JSON.parse(raw) as AuthUser;
        if (parsed && parsed.id) {
          setUser(parsed);
        }
      }
    } catch {
      // storage corrupto — no hacer nada
    } finally {
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const login = useCallback(
    async (username: string, password: string): Promise<AuthUser> => {
      const data = await apiFetch<{
        accessToken: string;
        user: { id: string; email: string; nombre_completo: string; rol: string; sede?: string };
      }>('/auth/login', {
        method: 'POST',
        body: { username, password },
      });

      const { accessToken, user: backendUser } = data;

      const mapped: AuthUser = {
        id: backendUser.id,
        email: backendUser.email,
        role: (backendUser.rol === 'Admin' ? 'admin' : 'technician') as Role,
        name: backendUser.nombre_completo,
        sede: backendUser.sede ?? 'Bucaramanga',
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped));
      localStorage.setItem(TOKEN_KEY, accessToken);

      setUser(mapped);
      return mapped;
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        initialized,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
};
