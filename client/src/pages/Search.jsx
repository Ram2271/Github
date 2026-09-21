import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { BookOpen, Code, CircleDot, GitPullRequest, Users, Search as SearchIcon, FileText } from 'lucide-react';
import { api } from '../api';
import RepoCard from '../components/profile/RepoCard';

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const currentType = searchParams.get('type') || 'repositories';

  const [inputVal, setInputVal] = useState(query);
  const [results, setResults] = useState([]);
  const [counts, setCounts] = useState({ repositories: 0, users: 0, code: 0, issues: 0, pullRequests: 0 });
  const [loading, setLoading] = useState(false);

  const performSearch = async (q, type) => {
    if (!q) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.search(q, type);
      setResults(data.results || []);
      setCounts(data.counts || { repositories: 0, users: 0, code: 0, issues: 0, pullRequests: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setInputVal(query);
    performSearch(query, currentType);
  }, [query, currentType]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    setSearchParams({ q: inputVal.trim(), type: currentType });
  };

  const navItems = [
    { id: 'repositories', label: 'Repositories', icon: BookOpen, count: counts.repositories },
    { id: 'code', label: 'Code', icon: Code, count: counts.code },
    { id: 'issues', label: 'Issues', icon: CircleDot, count: counts.issues },
    { id: 'pulls', label: 'Pull requests', icon: GitPullRequest, count: counts.pullRequests },
    { id: 'users', label: 'Users', icon: Users, count: counts.users }
  ];

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 text-xs text-gh-text space-y-6">
      {/* Top Search Input */}
      <form onSubmit={handleSubmit} className="max-w-2xl flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="w-4 h-4 text-gh-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            placeholder="Search GitHub..."
            className="w-full bg-gh-bg border border-gh-border rounded-md pl-9 pr-3 py-2 text-xs text-gh-text focus:outline-none focus:border-gh-link"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded-md font-semibold text-gh-text"
        >
          Search
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Category Sidebar */}
        <div className="space-y-1 border border-gh-border rounded-md bg-gh-surface p-2 h-fit">
          <div className="px-3 py-2 text-[11px] font-semibold text-gh-muted uppercase tracking-wider">
            Filter by
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentType === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSearchParams({ q: query, type: item.id })}
                className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-gh-subtle text-gh-text font-bold'
                    : 'text-gh-muted hover:text-gh-text hover:bg-gh-subtle/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </div>
                <span className="px-1.5 py-0.2 bg-gh-bg border border-gh-border rounded-full text-[10px]">
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Search Results */}
        <div className="lg:col-span-3 space-y-4">
          <div className="text-xs text-gh-muted border-b border-gh-border pb-3 flex items-center justify-between">
            <span>
              {query ? (
                <>
                  Found <strong className="text-gh-text">{results.length}</strong> results for &ldquo;{query}&rdquo;
                </>
              ) : (
                'Enter a query to search across repositories, code, issues, and users'
              )}
            </span>
          </div>

          {loading ? (
            <div className="p-16 text-center text-gh-muted animate-pulse">Searching GitHub...</div>
          ) : results.length > 0 ? (
            <div className="space-y-3">
              {/* Repositories */}
              {currentType === 'repositories' && (
                <div className="grid grid-cols-1 gap-3">
                  {results.map((r) => (
                    <RepoCard key={r._id} repo={r} />
                  ))}
                </div>
              )}

              {/* Code */}
              {currentType === 'code' && (
                <div className="space-y-3">
                  {results.map((f) => (
                    <div key={f._id} className="border border-gh-border rounded-md bg-gh-surface p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gh-muted" />
                        <Link
                          to={`/${f.ownerUsername}/${f.repoName}/blob/${f.branch}/${f.path}`}
                          className="font-mono text-gh-link hover:underline font-semibold"
                        >
                          {f.ownerUsername}/{f.repoName} &rsaquo; {f.path}
                        </Link>
                      </div>
                      <div className="text-[11px] text-gh-muted">
                        Branch: <span className="font-mono text-gh-text">{f.branch}</span> &bull; Size: {(f.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Users */}
              {currentType === 'users' && (
                <div className="space-y-3">
                  {results.map((u) => (
                    <div key={u._id} className="border border-gh-border rounded-md bg-gh-surface p-4 flex items-center gap-4">
                      <img
                        src={u.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${u.username}`}
                        alt=""
                        className="w-12 h-12 rounded-full border border-gh-border object-cover"
                      />
                      <div>
                        <Link to={`/${u.username}`} className="text-gh-link font-semibold text-sm hover:underline">
                          {u.name || u.username}
                        </Link>
                        <div className="text-gh-muted text-xs">@{u.username}</div>
                        {u.bio && <p className="text-gh-text text-xs mt-1">{u.bio}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Issues & PRs */}
              {['issues', 'pulls', 'pullRequests'].includes(currentType) && (
                <div className="space-y-3">
                  {results.map((item) => (
                    <div key={item._id} className="border border-gh-border rounded-md bg-gh-surface p-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gh-text">{item.title}</span>
                        <span className="text-gh-muted">#{item.number}</span>
                      </div>
                      <p className="text-gh-muted line-clamp-2">{item.body || 'No description provided.'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            query && (
              <div className="p-16 border border-gh-border rounded-md bg-gh-surface text-center text-gh-muted space-y-2">
                <SearchIcon className="w-8 h-8 mx-auto opacity-50" />
                <p className="font-semibold text-gh-text">We couldn&rsquo;t find any {currentType} matching &ldquo;{query}&rdquo;</p>
                <p className="text-xs">You could try searching across all of GitHub, or checking for spelling errors.</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
