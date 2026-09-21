import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      const data = await api.getUnreadCount();
      setUnreadCount(data.unreadCount || 0);
    } catch (_) {}
  };

  useEffect(() => {
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000); // 30s poll
    return () => clearInterval(interval);
  }, [user]);

  const markAllRead = async () => {
    try {
      await api.markNotificationsRead();
      setUnreadCount(0);
    } catch (_) {}
  };

  return (
    <NotificationContext.Provider value={{ unreadCount, refreshUnread: fetchUnread, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  return useContext(NotificationContext);
}
