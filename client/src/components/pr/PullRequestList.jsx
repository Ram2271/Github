import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GitPullRequest, GitMerge, CheckCircle2, MessageSquare, Plus, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

export default function PullRequestList({ repo, isOwner }) {
  const { user } = useAuth();
  const [prs, setPrs] = useState([]);
  const [counts, setCounts] = useState({ open: 0, closed: 0 });
  const [stateFilter, setStateFilter] = useState('open'); // 'open' | 'closed'
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadPRs = async () => {
    setLoading(true);
    try {
      const data = await api.listPRs(repo.ownerUsername, repo.name, stateFilter);
      setPrs(data.pullRequests || []);
      setCounts(data.counts || { open: 0, closed: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPRs();
  }, [repo, stateFilter]);

  const filteredPRs = prs.filter(pr =>
    pr.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search & New PR button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-gh-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all pull requests..."
            className="w-full bg-gh-bg border border-gh-border rounded-md pl-9 pr-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
          />
        </div>

        {user && (
          <Link
            to={`/${repo.ownerUsername}/${repo.name}/pulls/new`}
            className="px-3.5 py-1.5 bg-gh-green hover:bg-gh-greenHover text-white font-semibold rounded-md flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> New pull request
          </Link>
        )}
      </div>

      {/* PR Table */}
      <div className="border border-gh-border rounded-md bg-gh-surface overflow-hidden text-xs">
        {/* State Filter Bar */}
        <div className="px-4 py-3 bg-gh-subtle/50 border-b border-gh-border flex items-center gap-4">
          <button
            onClick={() => setStateFilter('open')}
            className={`flex items-center gap-1.5 font-medium transition-colors ${
              stateFilter === 'open' ? 'text-gh-text font-bold' : 'text-gh-muted hover:text-gh-text'
            }`}
          >
            <GitPullRequest className="w-4 h-4 text-emerald-400" />
            <span>{counts.open} Open</span>
          </button>
          <button
            onClick={() => setStateFilter('closed')}
            className={`flex items-center gap-1.5 font-medium transition-colors ${
              stateFilter === 'closed' ? 'text-gh-text font-bold' : 'text-gh-muted hover:text-gh-text'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
            <span>{counts.closed} Closed</span>
          </button>
        </div>

        {/* PR List */}
        <div className="divide-y divide-gh-border/60">
          {loading ? (
            <div className="p-8 text-center text-gh-muted animate-pulse">Loading pull requests...</div>
          ) : filteredPRs.length > 0 ? (
            filteredPRs.map((pr) => {
              const isMerged = pr.state === 'merged';
              return (
                <div
                  key={pr._id}
                  className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-gh-subtle/40 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    {isMerged ? (
                      <GitMerge className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                    ) : pr.state === 'open' ? (
                      <GitPullRequest className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <GitPullRequest className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="space-y-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <Link
                          to={`/${repo.ownerUsername}/${repo.name}/pull/${pr.number}`}
                          className="text-gh-text hover:text-gh-link font-semibold text-sm"
                        >
                          {pr.title}
                        </Link>
                        <span className="px-2 py-0.2 bg-gh-subtle border border-gh-border rounded font-mono text-[10px] text-gh-muted">
                          {pr.baseBranch} &larr; {pr.headBranch}
                        </span>
                      </div>

                      <div className="text-gh-muted text-[11px]">
                        #{pr.number} by <span className="text-gh-text font-medium">{pr.author?.username}</span>{' '}
                        {isMerged ? 'merged' : 'opened'}{' '}
                        {formatDistanceToNow(new Date(pr.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  </div>

                  {(pr.comments || []).length > 0 && (
                    <div className="flex items-center gap-1 text-gh-muted text-xs flex-shrink-0 mt-0.5">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{pr.comments.length}</span>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-12 text-center text-gh-muted space-y-2">
              <GitPullRequest className="w-8 h-8 mx-auto text-gh-muted opacity-50" />
              <p className="font-semibold text-gh-text">No {stateFilter} pull requests found</p>
              <p className="text-xs">There aren&rsquo;t any {stateFilter} pull requests right now.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
