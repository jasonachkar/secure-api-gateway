import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../api/admin';
import { refreshAccessToken } from '../api/client';
import { clearAccessToken, setAccessToken, subscribeToToken } from '../auth/tokenStore';
import { jwtDecode } from 'jwt-decode';

export interface AuthIdentity {
  id: string;
  username: string;
  roles: string[];
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  identity: AuthIdentity | null;
  login: (token: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [identity, setIdentity] = useState<AuthIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(
    () =>
      subscribeToToken((token) => {
        setIsAuthenticated(Boolean(token));
        if (!token) {
          setIdentity(null);
          return;
        }
        try {
          const claims = jwtDecode<{ sub?: string; username?: string; roles?: string[] }>(token);
          setIdentity({
            id: claims.sub ?? 'unknown',
            username: claims.username ?? 'Authenticated user',
            roles: claims.roles ?? [],
          });
        } catch {
          setIdentity(null);
        }
      }),
    []
  );

  useEffect(() => {
    let active = true;
    refreshAccessToken()
      .then(() => {
        if (active) setIsAuthenticated(true);
      })
      .catch(() => {
        if (active) setIsAuthenticated(false);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback((token: string) => {
    setAccessToken(token);
    setIsLoading(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminApi.logout();
    } finally {
      clearAccessToken();
      setIsLoading(false);
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, identity, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
