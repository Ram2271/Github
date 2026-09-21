import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CircleDot, CheckCircle2, MessageSquare, ArrowLeft } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import MarkdownViewer from '../repo/MarkdownViewer';

export default function IssueDetail({ repo }) {
  const { number } = useParams();
  const { user } = useAuth();

  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [togglingState, setTogglingState] = useState(false);

  const loadIssue = async () => {
    try {
      const data = await api.getIssue(repo.ownerUsername, repo.name, number);
      setIssue(data.issue);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIssue();
  }, [repo, number]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      await api.addIssueComment(repo.ownerUsername, repo.name, number, newComment.trim());
      setNewComment('');
      loadIssue();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleToggleState = async () => {
    setTogglingState(true);
    const targetState = issue.state === 'open' ? 'closed' : 'open';
    try {
      await api.toggleIssueState(repo.ownerUsername, repo.name, number, targetState);
      loadIssue();
    } catch (err) {
      alert(err.message);
    } finally {
      setTogglingState(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-gh-muted animate-pulse">Loading issue #{number}...</div>;
  }

  if (!issue) {
    return <div className="p-12 text-center text-gh-muted">Issue not found.</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <Link
          to={`/${repo.ownerUsername}/${repo.name}/issues`}
          className="text-xs text-gh-muted hover:text-gh-link flex items-center gap-1 mb-3"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to issues
        </Link>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl sm:text-2xl font-semibold text-gh-text leading-tight">
            {issue.title} <span className="text-gh-muted font-light">#{issue.number}</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 mt-2 text-xs text-gh-muted pb-4 border-b border-gh-border">
          <span
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-white ${
              issue.state === 'open' ? 'bg-[#238636]' : 'bg-[#8957e5]'
            }`}
          >
            {issue.state === 'open' ? (
              <>
                <CircleDot className="w-3.5 h-3.5" /> Open
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" /> Closed
              </>
            )}
          </span>
          <span>
            <strong className="text-gh-text">{issue.author?.username}</strong> opened this issue{' '}
            {formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })} &bull;{' '}
            {(issue.comments || []).length} comments
          </span>
        </div>
      </div>

      {/* Main Thread */}
      <div className="space-y-4">
        {/* Original Issue Description */}
        <div className="border border-gh-border rounded-md bg-gh-surface overflow-hidden">
          <div className="px-4 py-2 bg-gh-subtle/50 border-b border-gh-border flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <img
                src={issue.author?.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${issue.author?.username}`}
                alt=""
                className="w-5 h-5 rounded-full object-cover bg-gh-subtle"
              />
              <strong className="text-gh-text">{issue.author?.username}</strong>
              <span className="text-gh-muted">
                commented {formatDistanceToNow(new Date(issue.createdAt), { addSuffix: true })}
              </span>
            </div>
            <span className="text-[11px] text-gh-muted border border-gh-border rounded px-1.5 py-0.2">Author</span>
          </div>
          <div className="p-4 sm:p-6 text-xs text-gh-text">
            {issue.body ? (
              <MarkdownViewer content={issue.body} />
            ) : (
              <em className="text-gh-muted">No description provided.</em>
            )}
          </div>
        </div>

        {/* Comments List */}
        {(issue.comments || []).map((comment) => (
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
      </div>

      {/* Add Comment Box */}
      {user ? (
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
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleToggleState}
                disabled={togglingState}
                className="px-3 py-1.5 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded-md font-medium text-gh-text flex items-center gap-1.5"
              >
                {issue.state === 'open' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" /> Close issue
                  </>
                ) : (
                  <>
                    <CircleDot className="w-3.5 h-3.5 text-emerald-400" /> Reopen issue
                  </>
                )}
              </button>

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
      ) : (
        <div className="p-4 border border-gh-border rounded-md bg-gh-surface text-center text-xs text-gh-muted">
          <Link to="/login" className="text-gh-link hover:underline font-semibold">Sign in</Link> to join this conversation.
        </div>
      )}
    </div>
  );
}
