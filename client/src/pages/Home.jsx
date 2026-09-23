import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Plus, Compass, Sparkles, Play, Star, GitFork, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import RepoCard from '../components/profile/RepoCard';

export default function Home() {
  const { user } = useAuth();
  const [repos, setRepos] = useState([]);
  const [userRepos, setUserRepos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const data = await api.listRepos();
        setRepos(data.repositories || []);

        if (user) {
          const uData = await api.getUserRepos(user.username);
          setUserRepos(uData.repositories || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Sidebar: User Repositories & Quick Actions */}
        <div className="space-y-6">
          {user ? (
            <div className="bg-gh-surface border border-gh-border rounded-lg p-4 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-gh-text text-sm">Top Repositories</span>
                <Link
                  to="/new"
                  className="px-2.5 py-1 bg-gh-green hover:bg-gh-greenHover text-white rounded font-semibold flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" /> New
                </Link>
              </div>

              <div className="space-y-2 divide-y divide-gh-border/50">
                {userRepos.slice(0, 7).map((r) => (
                  <div key={r._id} className="pt-2 first:pt-0">
                    <Link
                      to={`/${r.ownerUsername}/${r.name}`}
                      className="font-medium text-gh-text hover:text-gh-link flex items-center gap-1.5 truncate"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-gh-muted flex-shrink-0" />
                      <span className="truncate">{r.name}</span>
                    </Link>
                  </div>
                ))}

                {userRepos.length === 0 && (
                  <p className="text-gh-muted italic pt-2">No repositories created yet.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gh-surface border border-gh-border rounded-lg p-5 space-y-3 text-xs text-center">
              <h3 className="text-base font-semibold text-gh-text">Welcome to GitHub</h3>
              <p className="text-gh-muted leading-relaxed">
                The open-source code platform powered by Google Drive cloud storage and MongoDB with an integrated live web project runner.
              </p>
              <div className="pt-2 flex flex-col gap-2">
                <Link
                  to="/register"
                  className="w-full py-2 bg-gh-green hover:bg-gh-greenHover text-white font-semibold rounded-md shadow-sm"
                >
                  Create an account
                </Link>
                <Link
                  to="/login"
                  className="w-full py-2 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border text-gh-text font-medium rounded-md"
                >
                  Sign in
                </Link>
              </div>
            </div>
          )}

          {/* Quick Runner Info Card */}
          <div className="border border-amber-500/30 rounded-lg p-4 bg-amber-500/5 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-amber-400">
              <Play className="w-4 h-4 fill-amber-400" />
              <span>⚡ Web Project Runner</span>
            </div>
            <p className="text-gh-muted text-[11px] leading-relaxed">
              Any repository with an <code className="text-gh-text">index.html</code> or <code className="text-gh-text">app.py</code> can be executed and previewed directly within the browser with live console streaming!
            </p>
          </div>
        </div>

        {/* Main Feed: Explore Repositories */}
        <div className="lg:col-span-3 space-y-6">
          <div className="flex items-center justify-between border-b border-gh-border pb-3">
            <div className="flex items-center gap-2">
              <Compass className="w-5 h-5 text-gh-link" />
              <h1 className="text-lg font-semibold text-gh-text">Explore Repositories</h1>
            </div>
            <span className="text-xs text-gh-muted">{repos.length} public projects available</span>
          </div>

          {loading ? (
            <div className="p-16 text-center text-gh-muted animate-pulse text-xs">
              Loading projects...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {repos.map((repo) => (
                <RepoCard key={repo._id} repo={repo} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
