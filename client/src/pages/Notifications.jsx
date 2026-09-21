import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Star, GitFork, CircleDot, GitPullRequest, GitMerge, MessageSquare, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../api';
import { useNotification } from '../context/NotificationContext';

export default function Notifications() {
  const { markAllRead } = useNotification();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const data = await api.getNotifications();
      setNotifications(data.notifications || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleMarkAll = async () => {
    await markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const getIcon = (type) => {
    switch (type) {
      case 'star': return <Star className="w-4 h-4 text-amber-400" />;
      case 'fork': return <GitFork className="w-4 h-4 text-sky-400" />;
      case 'issue': return <CircleDot className="w-4 h-4 text-emerald-400" />;
      case 'comment': return <MessageSquare className="w-4 h-4 text-gh-muted" />;
      case 'pr': return <GitPullRequest className="w-4 h-4 text-emerald-400" />;
      case 'merge': return <GitMerge className="w-4 h-4 text-purple-400" />;
      default: return <Bell className="w-4 h-4 text-gh-link" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 text-xs text-gh-text space-y-6">
      <div className="flex items-center justify-between border-b border-gh-border pb-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Bell className="w-5 h-5" /> Notifications
          </h1>
          <p className="text-gh-muted mt-0.5">Stay updated on your repositories, issues, and pull requests.</p>
        </div>

        {notifications.some(n => !n.read) && (
          <button
            onClick={handleMarkAll}
            className="px-3 py-1.5 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded font-semibold text-gh-text flex items-center gap-1.5"
          >
            <CheckCheck className="w-4 h-4 text-gh-green" /> Mark all as read
          </button>
        )}
      </div>

      <div className="border border-gh-border rounded-md bg-gh-surface overflow-hidden divide-y divide-gh-border/60">
        {loading ? (
          <div className="p-16 text-center text-gh-muted animate-pulse">Loading notifications...</div>
        ) : notifications.length > 0 ? (
          notifications.map((n) => (
            <div
              key={n._id}
              className={`p-4 flex items-start justify-between gap-4 transition-colors ${
                n.read ? 'bg-gh-surface hover:bg-gh-subtle/30' : 'bg-gh-subtle/40 hover:bg-gh-subtle/60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getIcon(n.type)}</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gh-text">{n.title}</span>
                    {!n.read && (
                      <span className="w-2 h-2 rounded-full bg-gh-link inline-block" />
                    )}
                  </div>
                  <p className="text-gh-muted text-xs">{n.message}</p>
                  <div className="text-[11px] text-gh-muted pt-1">
                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                  </div>
                </div>
              </div>

              {n.link && (
                <Link
                  to={n.link}
                  className="px-3 py-1 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded text-gh-link font-medium flex items-center gap-1 flex-shrink-0"
                >
                  <span>View</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
          ))
        ) : (
          <div className="p-16 text-center text-gh-muted space-y-2">
            <Bell className="w-8 h-8 mx-auto opacity-50" />
            <p className="font-semibold text-gh-text">All caught up!</p>
            <p className="text-xs">You have no unread notifications.</p>
          </div>
        )}
      </div>
    </div>
  );
}
