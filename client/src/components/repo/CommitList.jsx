import React, { useState, useEffect } from 'react';
import { GitCommit, Copy, Check, FileDiff } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../../api';

export default function CommitList({ repo, branch }) {
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedSha, setCopiedSha] = useState(null);
  const [selectedCommit, setSelectedCommit] = useState(null);
  const [commitDetail, setCommitDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await api.listCommits(repo.ownerUsername, repo.name, branch);
        setCommits(data.commits || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [repo, branch]);

  const handleCopy = (sha) => {
    navigator.clipboard.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 2000);
  };

  const handleSelectCommit = async (sha) => {
    setSelectedCommit(sha);
    setLoadingDetail(true);
    try {
      const data = await api.getCommit(repo.ownerUsername, repo.name, sha);
      setCommitDetail(data.commit);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-gh-muted animate-pulse text-xs">Loading commit history...</div>;
  }

  // If a specific commit is selected, show its detail view and unified diffs!
  if (selectedCommit && commitDetail) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => { setSelectedCommit(null); setCommitDetail(null); }}
          className="text-xs text-gh-link hover:underline font-semibold"
        >
          &larr; Back to commit history
        </button>

        <div className="border border-gh-border rounded-md bg-gh-surface p-5 space-y-2 text-xs">
          <h2 className="text-base font-semibold text-gh-text">{commitDetail.message}</h2>
          {commitDetail.description && (
            <p className="text-gh-muted">{commitDetail.description}</p>
          )}
          <div className="flex items-center gap-3 pt-2 text-gh-muted border-t border-gh-border/50">
            <span className="font-semibold text-gh-text">{commitDetail.author?.username}</span>
            <span>committed {formatDistanceToNow(new Date(commitDetail.createdAt), { addSuffix: true })}</span>
            <span className="font-mono bg-gh-subtle px-1.5 py-0.5 rounded border border-gh-border text-gh-text ml-auto">
              {commitDetail.sha}
            </span>
          </div>
        </div>

        {/* Files changed diffs */}
        <div className="space-y-4">
          <div className="text-xs text-gh-muted">
            Showing <strong className="text-gh-text">{commitDetail.filesChanged?.length || 0} changed files</strong> with{' '}
            <strong className="text-emerald-400">+{commitDetail.totalAdditions || 0} additions</strong> and{' '}
            <strong className="text-red-400">-{commitDetail.totalDeletions || 0} deletions</strong>.
          </div>

          {(commitDetail.filesChanged || []).map((file) => (
            <div key={file.path} className="border border-gh-border rounded-md bg-[#161b22] overflow-hidden text-xs">
              <div className="px-4 py-2 bg-gh-surface border-b border-gh-border flex items-center justify-between font-mono">
                <div className="flex items-center gap-2 text-gh-text">
                  <span
                    className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                      file.status === 'added'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : file.status === 'deleted'
                        ? 'bg-red-950 text-red-400 border border-red-800'
                        : 'bg-amber-950 text-amber-400 border border-amber-800'
                    }`}
                  >
                    {file.status}
                  </span>
                  <span>{file.path}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="text-emerald-400">+{file.additions}</span>
                  <span className="text-red-400">-{file.deletions}</span>
                </div>
              </div>

              {file.patch ? (
                <div className="overflow-x-auto p-2 font-mono text-[11px] leading-5">
                  {file.patch.split('\n').map((line, idx) => {
                    let bg = 'transparent';
                    let textColor = '#c9d1d9';
                    if (line.startsWith('+') && !line.startsWith('+++')) {
                      bg = 'rgba(46, 160, 67, 0.15)';
                      textColor = '#7ee787';
                    } else if (line.startsWith('-') && !line.startsWith('---')) {
                      bg = 'rgba(248, 81, 73, 0.15)';
                      textColor = '#ffa198';
                    } else if (line.startsWith('@@')) {
                      bg = 'rgba(56, 139, 253, 0.1)';
                      textColor = '#79c0ff';
                    }
                    return (
                      <div key={idx} style={{ backgroundColor: bg, color: textColor }} className="px-2 py-0.5 rounded whitespace-pre">
                        {line}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 text-center text-gh-muted italic">Binary file or no diff preview available.</div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gh-border rounded-md bg-gh-surface overflow-hidden text-xs">
      <div className="px-4 py-3 bg-gh-subtle/50 border-b border-gh-border font-semibold text-gh-text">
        Commits on <span className="font-mono">{branch}</span> ({commits.length})
      </div>

      <div className="divide-y divide-gh-border/60">
        {commits.map((c) => (
          <div key={c.sha} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-gh-subtle/40 transition-colors">
            <div className="flex items-start gap-3 min-w-0">
              <GitCommit className="w-4 h-4 text-gh-muted mt-0.5 flex-shrink-0" />
              <div className="space-y-0.5 min-w-0">
                <button
                  onClick={() => handleSelectCommit(c.sha)}
                  className="text-gh-text hover:text-gh-link font-semibold text-left truncate block max-w-xl"
                >
                  {c.message}
                </button>
                <div className="text-gh-muted text-[11px] flex items-center gap-1.5">
                  <span className="text-gh-text font-medium">{c.author?.username}</span>
                  <span>committed {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleCopy(c.sha)}
                className="p-1 hover:bg-gh-subtle border border-gh-border rounded text-gh-muted hover:text-gh-text"
                title="Copy full SHA"
              >
                {copiedSha === c.sha ? <Check className="w-3.5 h-3.5 text-gh-green" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => handleSelectCommit(c.sha)}
                className="px-2 py-1 font-mono text-[11px] bg-gh-subtle border border-gh-border hover:border-gh-muted rounded text-gh-link font-semibold"
              >
                {c.shortSha || c.sha.substring(0, 7)}
              </button>
            </div>
          </div>
        ))}

        {commits.length === 0 && (
          <div className="p-8 text-center text-gh-muted">No commits found on this branch.</div>
        )}
      </div>
    </div>
  );
}
