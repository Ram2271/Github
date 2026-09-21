import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CircleDot, CheckCircle2, MessageSquare, Plus, Search } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

export default function IssueList({ repo, isOwner }) {
  const { user } = useAuth();
  const [issues, setIssues] = useState([]);
  const [counts, setCounts] = useState({ open: 0, closed: 0 });
  const [stateFilter, setStateFilter] = useState('open'); // 'open' | 'closed'
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // New Issue Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [creating, setCreating] = useState(false);

  const loadIssues = async () => {
    setLoading(true);
    try {
      const data = await api.listIssues(repo.ownerUsername, repo.name, stateFilter);
      setIssues(data.issues || []);
      setCounts(data.counts || { open: 0, closed: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIssues();
  }, [repo, stateFilter]);

  const handleCreateIssue = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api.createIssue(repo.ownerUsername, repo.name, {
        title: newTitle.trim(),
        body: newBody.trim()
      });
      setModalOpen(false);
      setNewTitle('');
      setNewBody('');
      loadIssues();
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  const filteredIssues = issues.filter(i =>
    i.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search & New Issue Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-gh-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all issues..."
            className="w-full bg-gh-bg border border-gh-border rounded-md pl-9 pr-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
          />
        </div>

        {user && (
          <button
            onClick={() => setModalOpen(true)}
            className="px-3.5 py-1.5 bg-gh-green hover:bg-gh-greenHover text-white font-semibold rounded-md flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> New issue
          </button>
        )}
      </div>

      {/* Issues Table */}
      <div className="border border-gh-border rounded-md bg-gh-surface overflow-hidden text-xs">
        {/* State Filter Bar */}
        <div className="px-4 py-3 bg-gh-subtle/50 border-b border-gh-border flex items-center gap-4">
          <button
            onClick={() => setStateFilter('open')}
            className={`flex items-center gap-1.5 font-medium transition-colors ${
              stateFilter === 'open' ? 'text-gh-text font-bold' : 'text-gh-muted hover:text-gh-text'
            }`}
          >
            <CircleDot className="w-4 h-4 text-emerald-400" />
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

        {/* List */}
        <div className="divide-y divide-gh-border/60">
          {loading ? (
            <div className="p-8 text-center text-gh-muted animate-pulse">Loading issues...</div>
          ) : filteredIssues.length > 0 ? (
            filteredIssues.map((issue) => (
              <div
                key={issue._id}
                className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-gh-subtle/40 transition-colors"
              >
                <div className="flex items-start gap-2.5">
                  {issue.state === 'open' ? (
                    <CircleDot className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <Link
                        to={`/${repo.ownerUsername}/${repo.name}/issues/${issue.number}`}
                        className="text-gh-text hover:text-gh-link font-semibold text-sm"
                      >
                        {issue.title}
                      </Link>
                      {(issue.labels || []).map((l, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium border"
                          style={{
                            backgroundColor: `${l.color}20`,
                            borderColor: `${l.color}60`,
                            color: l.color
                          }}
                        >
                          {l.name}
                        </span>
                      ))}
                    </div>

                    <div className="text-gh-muted text-[11px]">
                      #{issue.number} opened{' '}
                      {formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })} by{' '}
                      <span className="text-gh-text font-medium">{issue.author?.username}</span>
                    </div>
                  </div>
                </div>

                {(issue.comments || []).length > 0 && (
                  <div className="flex items-center gap-1 text-gh-muted text-xs flex-shrink-0 mt-0.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{issue.comments.length}</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-gh-muted space-y-2">
              <CircleDot className="w-8 h-8 mx-auto text-gh-muted opacity-50" />
              <p className="font-semibold text-gh-text">No {stateFilter} issues found</p>
              <p className="text-xs">There aren&rsquo;t any {stateFilter} issues right now.</p>
            </div>
          )}
        </div>
      </div>

      {/* New Issue Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50">
          <div className="bg-gh-surface border border-gh-border rounded-xl max-w-xl w-full p-6 space-y-4 text-xs shadow-2xl">
            <h3 className="text-base font-semibold text-gh-text">Create new issue</h3>
            <form onSubmit={handleCreateIssue} className="space-y-3">
              <div>
                <label className="block text-gh-text font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Title"
                  className="w-full bg-gh-bg border border-gh-border rounded px-3 py-2 text-xs text-gh-text focus:outline-none focus:border-gh-link"
                />
              </div>

              <div>
                <label className="block text-gh-text font-medium mb-1">Leave a comment</label>
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  placeholder="Describe the issue, bug, or feature request..."
                  rows={6}
                  className="w-full bg-gh-bg border border-gh-border rounded px-3 py-2 text-xs text-gh-text focus:outline-none focus:border-gh-link"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gh-border">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-1.5 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded text-gh-text font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="px-4 py-1.5 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white font-semibold rounded"
                >
                  {creating ? 'Submitting...' : 'Submit new issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
