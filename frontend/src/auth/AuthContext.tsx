import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  email: string;
  name: string;
  tenantId: string;
  token: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  signIn: (email: string, password: string, tenantId?: string) => Promise<void>;
  signUp: (email: string, password: string, tenantId?: string) => Promise<void>;
  signOut: () => void;
  switchTenant: (tenantId: string) => void;
}

const STORAGE_KEY = 'areweupyet_session';

// Helper to create a synthetic signed JWT header.payload for local/Cognito dev
function createDevJwt(email: string, tenantId: string): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      sub: email,
      'cognito:username': email,
      email: email,
      custom_tenant: tenantId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400 * 7,
    })
  );
  return `${header}.${payload}.mockSignature`;
}

const defaultUser: User = {
  email: 'admin@acme.corp',
  name: 'Acme Admin',
  tenantId: 'demo',
  token: createDevJwt('admin@acme.corp', 'demo'),
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return defaultUser;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  const signIn = async (email: string, _password: string, tenantId?: string) => {
    const tid = tenantId?.trim() || 'demo';
    const token = createDevJwt(email, tid);
    const newUser: User = {
      email,
      name: email.split('@')[0],
      tenantId: tid,
      token,
    };
    setUser(newUser);
  };

  const signUp = async (email: string, _password: string, tenantId?: string) => {
    const tid = tenantId?.trim() || email.split('@')[0];
    const token = createDevJwt(email, tid);
    const newUser: User = {
      email,
      name: email.split('@')[0],
      tenantId: tid,
      token,
    };
    setUser(newUser);
  };

  const signOut = () => {
    setUser(null);
  };

  const switchTenant = (tenantId: string) => {
    if (!user) return;
    const token = createDevJwt(user.email, tenantId);
    setUser({ ...user, tenantId, token });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        signIn,
        signUp,
        signOut,
        switchTenant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
