import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

function getStoredUser() {
  try {
    const token = localStorage.getItem('gh_token');
    const savedUser = localStorage.getItem('gh_user');
    if (token && savedUser) {
      return JSON.parse(savedUser);
    }
  } catch (_) {}
  return null;
}

function saveSession(token, userObj) {
  try {
    if (token) {
      localStorage.setItem('gh_token', token);
    }
    if (userObj) {
      localStorage.setItem('gh_user', JSON.stringify(userObj));
    }
  } catch (_) {}
}

function clearSession() {
  try {
    localStorage.removeItem('gh_token');
    localStorage.removeItem('gh_user');
  } catch (_) {}
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(() => {
    const token = localStorage.getItem('gh_token');
    const cached = getStoredUser();
    // If we already have a cached user in browser memory, don't block UI
    return Boolean(token && !cached);
  });

  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem('gh_token');
      if (!token) {
        clearSession();
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const data = await api.getMe();
        if (data && data.user) {
          saveSession(token, data.user);
          setUser(data.user);
        }
      } catch (err) {
        // Only clear browser memory if the server explicitly rejected the token with 401
        if (err && err.status === 401) {
          console.warn('Session expired or invalid (401):', err.message);
          clearSession();
          setUser(null);
        } else {
          console.warn('Transient error verifying session, keeping cached login:', err?.message);
        }
      } finally {
        setLoading(false);
      }
    }
    loadUser();

    // Sync login/logout state across browser tabs
    function handleStorageChange(e) {
      if (e.key === 'gh_token' || e.key === 'gh_user') {
        setUser(getStoredUser());
      }
    }
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const login = async (loginVal, password, code) => {
    const data = await api.login({ login: loginVal, password, code });
    if (data.token && data.user) {
      saveSession(data.token, data.user);
      setUser(data.user);
    }
    return data;
  };

  const verifyLogin = async (email, code) => {
    const data = await api.loginVerify({ email, code });
    if (data.token && data.user) {
      saveSession(data.token, data.user);
      setUser(data.user);
    }
    return data.user;
  };

  const register = async (username, email, password, name, code) => {
    const data = await api.register({ username, email, password, name, code });
    if (data.token && data.user) {
      saveSession(data.token, data.user);
      setUser(data.user);
    }
    return data;
  };

  const verifyRegister = async (email, code) => {
    const data = await api.registerVerify({ email, code });
    if (data.token && data.user) {
      saveSession(data.token, data.user);
      setUser(data.user);
    }
    return data.user;
  };

  const resendVerificationCode = async (email, type) => {
    return api.resendCode({ email, type });
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  const updateProfile = async (updates) => {
    const data = await api.updateProfile(updates);
    if (data && data.user) {
      saveSession(localStorage.getItem('gh_token'), data.user);
      setUser(data.user);
    }
    return data.user;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        verifyLogin,
        register,
        verifyRegister,
        resendVerificationCode,
        logout,
        updateProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
