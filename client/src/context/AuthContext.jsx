import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem('gh_token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await api.getMe();
        setUser(data.user);
      } catch (err) {
        console.error('Session expired:', err.message);
        localStorage.removeItem('gh_token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    loadUser();
  }, []);

  const login = async (loginVal, password, code) => {
    const data = await api.login({ login: loginVal, password, code });
    if (data.token) {
      localStorage.setItem('gh_token', data.token);
      setUser(data.user);
    }
    return data;
  };

  const verifyLogin = async (email, code) => {
    const data = await api.loginVerify({ email, code });
    if (data.token) {
      localStorage.setItem('gh_token', data.token);
      setUser(data.user);
    }
    return data.user;
  };

  const register = async (username, email, password, name, code) => {
    const data = await api.register({ username, email, password, name, code });
    if (data.token) {
      localStorage.setItem('gh_token', data.token);
      setUser(data.user);
    }
    return data;
  };

  const verifyRegister = async (email, code) => {
    const data = await api.registerVerify({ email, code });
    if (data.token) {
      localStorage.setItem('gh_token', data.token);
      setUser(data.user);
    }
    return data.user;
  };

  const resendVerificationCode = async (email, type) => {
    return api.resendCode({ email, type });
  };

  const logout = () => {
    localStorage.removeItem('gh_token');
    setUser(null);
  };

  const updateProfile = async (updates) => {
    const data = await api.updateProfile(updates);
    setUser(data.user);
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
