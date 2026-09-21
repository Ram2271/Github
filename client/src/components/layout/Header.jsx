import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Bell, Plus, GitPullRequest, CircleDot, Compass, LogOut, User as UserIcon, BookOpen, Star, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { api } from '../../api';

export default function Header() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotification();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickResults, setQuickResults] = useState({ repos: [], users: [] });
  const [userDropdown, setUserDropdown] = useState(false);
  const [plusDropdown, setPlusDropdown] = useState(false);

  const searchInputRef = useRef(null);
  const searchContainerRef = useRef(null);
  const userMenuRef = useRef(null);

  // Global "/" keyboard shortcut to focus search
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === '/' && document.activeElement !== searchInputRef.current && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Quick search autocomplete
  useEffect(() => {
    if (!searchQuery.trim()) {
      setQuickResults({ repos: [], users: [] });
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await api.search(searchQuery.trim());
        setQuickResults({
          repos: (data.results || []).slice(0, 4),
          users: []
        });
      } catch (_) {}
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setUserDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchOpen(false);
    navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
  };

  return (
    <header className="bg-gh-surface border-b border-gh-border text-gh-text text-sm sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Left: Brand + Nav Links */}
        <div className="flex items-center gap-4 flex-1">
          <Link to="/" className="text-white hover:opacity-80 transition-opacity flex items-center gap-2">
            <svg height="32" viewBox="0 0 16 16" width="32" fill="currentColor">
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
            </svg>
            <span className="font-semibold text-base hidden sm:inline tracking-tight text-white">GitHub</span>
          </Link>

          {/* Global Search Bar */}
          <div className="relative flex-1 max-w-md" ref={searchContainerRef}>
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gh-muted pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                placeholder="Type / to search"
                className="w-full bg-gh-bg border border-gh-border rounded-md pl-9 pr-8 py-1.5 text-xs text-gh-text placeholder:text-gh-muted focus:outline-none focus:border-gh-link focus:ring-1 focus:ring-gh-link transition-all"
              />
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 bg-gh-subtle border border-gh-border text-gh-muted rounded px-1.5 py-0.5 text-[10px] pointer-events-none">
                /
              </kbd>
            </form>

            {/* Quick search dropdown */}
            {searchOpen && searchQuery.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-gh-surface border border-gh-border rounded-md shadow-2xl overflow-hidden z-50">
                <div className="p-2 border-b border-gh-border">
                  <div
                    onClick={handleSearchSubmit}
                    className="p-2 rounded hover:bg-gh-subtle cursor-pointer flex items-center justify-between text-xs text-gh-link font-medium"
                  >
                    <span>Search for &ldquo;{searchQuery}&rdquo; in all of GitHub</span>
                    <span className="text-[10px] text-gh-muted">↵ Enter</span>
                  </div>
                </div>
                {quickResults.repos.length > 0 && (
                  <div className="p-1">
                    <div className="px-2 py-1 text-[11px] font-semibold text-gh-muted uppercase tracking-wider">Repositories</div>
                    {quickResults.repos.map(r => (
                      <Link
                        key={r._id}
                        to={`/${r.ownerUsername}/${r.name}`}
                        onClick={() => setSearchOpen(false)}
                        className="block px-3 py-1.5 rounded hover:bg-gh-subtle text-xs"
                      >
                        <div className="font-medium text-gh-link">{r.ownerUsername} / <span className="font-semibold">{r.name}</span></div>
                        {r.description && <div className="text-[11px] text-gh-muted truncate">{r.description}</div>}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Links */}
          <nav className="hidden md:flex items-center gap-4 text-xs font-semibold text-gh-text">
            <Link to="/" className="hover:text-gh-link flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-gh-muted" /> Explore
            </Link>
            <Link to="/search?type=issues" className="hover:text-gh-link flex items-center gap-1.5">
              <CircleDot className="w-4 h-4 text-gh-muted" /> Issues
            </Link>
            <Link to="/search?type=pulls" className="hover:text-gh-link flex items-center gap-1.5">
              <GitPullRequest className="w-4 h-4 text-gh-muted" /> Pull requests
            </Link>
          </nav>
        </div>

        {/* Right: Actions / Auth */}
        <div className="flex items-center gap-2.5">
          {user ? (
            <>
              {/* Notifications */}
              <Link
                to="/notifications"
                className="relative p-1.5 text-gh-muted hover:text-gh-text rounded-md hover:bg-gh-subtle transition-colors"
                title="Notifications"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-gh-link rounded-full animate-pulse" />
                )}
              </Link>

              {/* Create (+) */}
              <div className="relative">
                <Link
                  to="/new"
                  className="p-1.5 text-gh-muted hover:text-gh-text rounded-md hover:bg-gh-subtle transition-colors flex items-center gap-1"
                  title="Create new repository"
                >
                  <Plus className="w-4 h-4" />
                </Link>
              </div>

              {/* User Dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setUserDropdown(!userDropdown)}
                  className="flex items-center rounded-full border border-gh-border focus:outline-none focus:ring-2 focus:ring-gh-link"
                >
                  <img
                    src={user.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.username}`}
                    alt={user.username}
                    className="w-7 h-7 rounded-full object-cover bg-gh-subtle"
                  />
                </button>

                {userDropdown && (
                  <div className="absolute right-0 mt-2 w-56 bg-gh-surface border border-gh-border rounded-md shadow-2xl py-1 z-50 text-xs">
                    <div className="px-3 py-2 border-b border-gh-border text-gh-muted">
                      <div>Signed in as</div>
                      <div className="font-semibold text-gh-text truncate mt-0.5">@{user.username}</div>
                    </div>
                    <Link
                      to={`/${user.username}`}
                      onClick={() => setUserDropdown(false)}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gh-subtle text-gh-text"
                    >
                      <UserIcon className="w-4 h-4 text-gh-muted" /> Your profile
                    </Link>
                    <Link
                      to={`/${user.username}?tab=repositories`}
                      onClick={() => setUserDropdown(false)}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gh-subtle text-gh-text"
                    >
                      <BookOpen className="w-4 h-4 text-gh-muted" /> Your repositories
                    </Link>
                    <Link
                      to={`/${user.username}?tab=stars`}
                      onClick={() => setUserDropdown(false)}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gh-subtle text-gh-text"
                    >
                      <Star className="w-4 h-4 text-gh-muted" /> Your stars
                    </Link>
                    <Link
                      to="/new"
                      onClick={() => setUserDropdown(false)}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-gh-subtle text-gh-text border-t border-gh-border"
                    >
                      <Plus className="w-4 h-4 text-gh-muted" /> New repository
                    </Link>
                    <button
                      onClick={() => {
                        setUserDropdown(false);
                        logout();
                        navigate('/');
                      }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-gh-subtle text-gh-red border-t border-gh-border"
                    >
                      <LogOut className="w-4 h-4" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="px-3 py-1.5 text-xs font-medium text-gh-text hover:text-white rounded-md border border-gh-border hover:border-gh-muted transition-colors"
              >
                Sign in
              </Link>
              <Link
                to="/register"
                className="px-3 py-1.5 text-xs font-medium text-white bg-gh-green hover:bg-gh-greenHover rounded-md transition-colors shadow-sm"
              >
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
