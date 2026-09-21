import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GitPullRequest, GitMerge, Check, FileDiff, MessageSquare, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import MarkdownViewer from '../repo/MarkdownViewer';

export default function PullRequestDetail({ repo }) {
  const { number } = useParams();
  const { user } = useAuth();

  const [prData, setPrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('conversation'); // 'conversation' | 'files'
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [merging, setMerging] = useState(false);

  const loadPR = async () => {
    try {
      const data = await api.getPR(repo.ownerUsername, repo.name, number);
      setPrData(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPR();
  }, [repo, number]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      await api.addPRComment(repo.ownerUsername, repo.name, number, newComment.trim());
      setNewComment('');
      loadPR();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleMerge = async () => {
    if (!confirm(`Merge pull request #${number} into ${prData.pullRequest.baseBranch}?`)) return;
    setMerging(true);
    try {
      await api.mergePR(repo.ownerUsername, repo.name, number);
      loadPR();
    } catch (err) {
      alert(err.message);
    } finally {
      setMerging(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-gh-muted animate-pulse">Loading pull request #{number}...</div>;
  }

  if (!prData) {
    return <div className="p-12 text-center text-gh-muted">Pull request not found.</div>;
  }

  const { pullRequest: pr, diff, canMerge } = prData;
  const isMerged = pr.state === 'merged';

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <Link
          to={`/${repo.ownerUsername}/${repo.name}/pulls`}
          className="text-xs text-gh-muted hover:text-gh-link flex items-center gap-1 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to pull requests
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold text-gh-text leading-tight">
          {pr.title} <span className="text-gh-muted font-light">#{pr.number}</span>
        </h1>

        <div className="flex items-center flex-wrap gap-2 mt-2 text-xs text-gh-muted pb-4 border-b border-gh-border">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white ${
              isMerged
                ? 'bg-[#8957e5]'
                : pr.state === 'open'
                ? 'bg-[#238636]'
                : 'bg-[#da3633]'
            }`}
          >
            {isMerged ? <GitMerge className="w-3.5 h-3.5" /> : <GitPullRequest className="w-3.5 h-3.5" />}
            <span className="capitalize">{pr.state}</span>
          </span>

          <span>
            <strong className="text-gh-text">{pr.author?.username}</strong> wants to merge into{' '}
            <span className="font-mono bg-gh-subtle px-1.5 py-0.5 rounded border border-gh-border text-gh-text">{pr.baseBranch}</span> from{' '}
            <span className="font-mono bg-gh-subtle px-1.5 py-0.5 rounded border border-gh-border text-gh-text">{pr.headBranch}</span>
          </span>
        </div>

        {/* PR Tabs */}
        <div className="flex border-b border-gh-border mt-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('conversation')}
            className={`flex items-center gap-1.5 px-4 py-2 border-b-2 -mb-px transition-colors ${
              activeTab === 'conversation'
                ? 'border-[#f78166] text-gh-text font-bold'
                : 'border-transparent text-gh-muted hover:text-gh-text'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Conversation</span>
            <span className="px-1.5 py-0.2 rounded-full bg-gh-subtle text-[11px] text-gh-muted">
              {(pr.comments || []).length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-1.5 px-4 py-2 border-b-2 -mb-px transition-colors ${
              activeTab === 'files'
                ? 'border-[#f78166] text-gh-text font-bold'
                : 'border-transparent text-gh-muted hover:text-gh-text'
            }`}
          >
            <FileDiff className="w-4 h-4" />
            <span>Files changed</span>
            <span className="px-1.5 py-0.2 rounded-full bg-gh-subtle text-[11px] text-gh-muted">
              {diff?.filesChanged?.length || 0}
            </span>
          </button>
        </div>
      </div>

      {/* Tab Content: Conversation */}
      {activeTab === 'conversation' && (
        <div className="space-y-6">
          {/* Original PR Description */}
          <div className="border border-gh-border rounded-md bg-gh-surface overflow-hidden">
            <div className="px-4 py-2 bg-gh-subtle/50 border-b border-gh-border flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <img
                  src={pr.author?.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${pr.author?.username}`}
                  alt=""
                  className="w-5 h-5 rounded-full object-cover bg-gh-subtle"
                />
                <strong className="text-gh-text">{pr.author?.username}</strong>
                <span className="text-gh-muted">
                  opened this pull request {formatDistanceToNow(new Date(pr.createdAt), { addSuffix: true })}
                </span>
              </div>
            </div>
            <div className="p-4 sm:p-6 text-xs text-gh-text">
              {pr.body ? <MarkdownViewer content={pr.body} /> : <em className="text-gh-muted">No description provided.</em>}
            </div>
          </div>

          {/* Comments */}
          {(pr.comments || []).map((comment) => (
            <div key={comment.id} className="border border-gh-border rounded-md bg-gh-surface overflow-hidden">
              <div className="px-4 py-2 bg-gh-subtle/50 border-b border-gh-border flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <img
                    src={comment.author?.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${comment.author?.username}`}
                    alt=""
                    className="w-5 h-5 rounded-full object-cover bg-gh-subtle"
                  />
                  <strong className="text-gh-text">{comment.author?.username}</strong>
                  <span className="text-gh-muted">
                    commented {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
              <div className="p-4 sm:p-6 text-xs text-gh-text">
                <MarkdownViewer content={comment.body} />
              </div>
            </div>
          ))}

          {/* Merge Banner */}
          {isMerged ? (
            <div className="p-4 border border-purple-800/60 rounded-md bg-purple-950/20 text-xs flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-400 flex-shrink-0">
                <GitMerge className="w-4 h-4" />
              </div>
              <div>
                <div className="font-semibold text-purple-300">Pull request successfully merged and closed</div>
                <div className="text-gh-muted text-[11px] mt-0.5">
                  Merged into <strong className="font-mono text-gh-text">{pr.baseBranch}</strong>{' '}
                  {pr.mergedAt && formatDistanceToNow(new Date(pr.mergedAt), { addSuffix: true })} by{' '}
                  <span className="text-gh-text">{pr.mergedBy?.username}</span>
                </div>
              </div>
            </div>
          ) : pr.state === 'open' ? (
            <div className="border border-gh-border rounded-md bg-gh-surface p-5 space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <Check className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-gh-text">This branch has no conflicts with the base branch</h3>
                  <p className="text-gh-muted text-[11px]">Merging can be performed automatically.</p>
                </div>
              </div>

              {canMerge ? (
                <div className="pt-2">
                  <button
                    onClick={handleMerge}
                    disabled={merging}
                    className="px-4 py-2 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white font-semibold rounded-md shadow-sm flex items-center gap-2"
                  >
                    <GitMerge className="w-4 h-4" />
                    <span>{merging ? 'Merging changes...' : 'Merge pull request'}</span>
                  </button>
                </div>
              ) : (
                <div className="text-gh-muted text-[11px] italic">
                  Only repository administrators can merge pull requests.
                </div>
              )}
            </div>
          ) : null}

          {/* Add Comment */}
          {user && (
            <div className="border border-gh-border rounded-md bg-gh-surface p-4 space-y-3 text-xs">
              <h3 className="font-semibold text-gh-text">Add a comment</h3>
              <form onSubmit={handleAddComment} className="space-y-3">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Leave a comment..."
                  rows={4}
                  className="w-full bg-gh-bg border border-gh-border rounded-md px-3 py-2 text-xs text-gh-text focus:outline-none focus:border-gh-link"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingComment || !newComment.trim()}
                    className="px-4 py-1.5 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white font-semibold rounded-md shadow-sm"
                  >
                    {submittingComment ? 'Commenting...' : 'Comment'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Files Changed (Diff View) */}
      {activeTab === 'files' && (
        <div className="space-y-6">
          <div className="text-xs text-gh-muted">
            Showing <strong className="text-gh-text">{diff?.filesChanged?.length || 0} changed files</strong> with{' '}
            <strong className="text-emerald-400">+{diff?.totalAdditions || 0} additions</strong> and{' '}
            <strong className="text-red-400">-{diff?.totalDeletions || 0} deletions</strong>.
          </div>

          {(diff?.filesChanged || []).map((file) => (
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

              {/* Unified Patch Code Lines */}
              <div className="overflow-x-auto p-2 font-mono text-[11px] leading-5">
                {(file.patch || '').split('\n').map((line, idx) => {
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
