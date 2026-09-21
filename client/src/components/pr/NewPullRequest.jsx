import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { GitPullRequest, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { api } from '../../api';

export default function NewPullRequest({ repo, branches = [] }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [baseBranch, setBaseBranch] = useState(searchParams.get('base') || repo.defaultBranch || 'main');
  const [headBranch, setHeadBranch] = useState(
    searchParams.get('head') || (branches.find(b => b !== (repo.defaultBranch || 'main')) || 'main')
  );

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!title && headBranch) {
      setTitle(`Update from ${headBranch}`);
    }
  }, [headBranch, title]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !headBranch) return;

    setSubmitting(true);
    try {
      const data = await api.createPR(repo.ownerUsername, repo.name, {
        baseBranch,
        headBranch,
        title: title.trim(),
        body: body.trim()
      });
      navigate(`/${repo.ownerUsername}/${repo.name}/pull/${data.pullRequest.number}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Link
        to={`/${repo.ownerUsername}/${repo.name}/pulls`}
        className="text-xs text-gh-muted hover:text-gh-link flex items-center gap-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to pull requests
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-gh-text">Open a pull request</h1>
        <p className="text-xs text-gh-muted mt-1">
          Compare changes across branches and review file modifications before merging.
        </p>
      </div>

      {/* Branch Selectors Box */}
      <div className="p-4 border border-gh-border rounded-md bg-gh-surface flex flex-wrap items-center gap-3 text-xs">
        <span className="text-gh-muted font-semibold">base:</span>
        <select
          value={baseBranch}
          onChange={(e) => setBaseBranch(e.target.value)}
          className="bg-gh-bg border border-gh-border rounded px-3 py-1 text-xs text-gh-text font-mono focus:outline-none focus:border-gh-link"
        >
          {branches.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        <span className="text-gh-muted">&larr;</span>

        <span className="text-gh-muted font-semibold">compare:</span>
        <select
          value={headBranch}
          onChange={(e) => setHeadBranch(e.target.value)}
          className="bg-gh-bg border border-gh-border rounded px-3 py-1 text-xs text-gh-text font-mono focus:outline-none focus:border-gh-link"
        >
          {branches.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>

        {baseBranch === headBranch ? (
          <span className="text-xs text-gh-red ml-auto font-medium">
            Please choose different branches to compare.
          </span>
        ) : (
          <span className="text-xs text-emerald-400 ml-auto font-medium flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Able to merge
          </span>
        )}
      </div>

      {/* PR Form */}
      <form onSubmit={handleSubmit} className="border border-gh-border rounded-md bg-gh-surface p-6 space-y-4 text-xs">
        <div>
          <label className="block text-gh-text font-medium mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full bg-gh-bg border border-gh-border rounded px-3 py-2 text-xs text-gh-text focus:outline-none focus:border-gh-link"
          />
        </div>

        <div>
          <label className="block text-gh-text font-medium mb-1">Description</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe the purpose of this pull request..."
            rows={5}
            className="w-full bg-gh-bg border border-gh-border rounded px-3 py-2 text-xs text-gh-text focus:outline-none focus:border-gh-link"
          />
        </div>

        <div className="flex justify-end pt-3 border-t border-gh-border">
          <button
            type="submit"
            disabled={submitting || !title.trim() || baseBranch === headBranch}
            className="px-5 py-2 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white font-semibold rounded-md shadow-sm flex items-center gap-2"
          >
            <GitPullRequest className="w-4 h-4" />
            <span>{submitting ? 'Creating...' : 'Create pull request'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
