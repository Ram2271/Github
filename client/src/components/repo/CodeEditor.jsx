import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitCommit, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

export default function CodeEditor({ repo, branch, initialPath = '', isEdit = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [filePath, setFilePath] = useState(initialPath);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitDesc, setCommitDesc] = useState('');
  const [commitTarget, setCommitTarget] = useState('direct'); // 'direct' | 'new_branch'
  const [newBranchName, setNewBranchName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isEdit && initialPath) {
      async function loadExisting() {
        try {
          const data = await api.getBlob(repo.ownerUsername, repo.name, branch, initialPath);
          setContent(data.content || '');
          setCommitMessage(`Update ${initialPath.split('/').pop()}`);
        } catch (err) {
          alert(err.message);
        } finally {
          setLoading(false);
        }
      }
      loadExisting();
    } else {
      setCommitMessage(filePath ? `Create ${filePath.split('/').pop()}` : 'Create new file');
    }
  }, [isEdit, initialPath, branch, repo]);

  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const val = e.target.value;
      setContent(val.substring(0, start) + '  ' + val.substring(end));
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 2;
      }, 0);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!filePath.trim()) {
      alert('Please enter a valid file path');
      return;
    }

    setSubmitting(true);
    let targetBranch = branch;

    try {
      if (commitTarget === 'new_branch') {
        const cleanBranch = newBranchName.trim() || `patch-${Date.now().toString().slice(-4)}`;
        await api.createBranch(repo.ownerUsername, repo.name, {
          name: cleanBranch,
          sourceBranch: branch
        });
        targetBranch = cleanBranch;
      }

      if (isEdit) {
        const cleanNew = filePath.trim();
        const isRename = cleanNew !== initialPath;
        const res = await api.editFile(repo.ownerUsername, repo.name, {
          path: cleanNew,
          oldPath: initialPath,
          content,
          branch: targetBranch,
          message: commitMessage || (isRename ? `Rename ${initialPath.split('/').pop()} to ${cleanNew.split('/').pop()}` : `Update ${cleanNew.split('/').pop()}`),
          description: commitDesc
        });
        const finalPath = res.newPath || cleanNew;
        if (commitTarget === 'new_branch') {
          navigate(`/${repo.ownerUsername}/${repo.name}/pulls/new?head=${targetBranch}&base=${branch}`);
        } else {
          navigate(`/${repo.ownerUsername}/${repo.name}/blob/${targetBranch}/${finalPath}`);
        }
      } else {
        await api.createFile(repo.ownerUsername, repo.name, {
          path: filePath.trim(),
          content,
          branch: targetBranch,
          message: commitMessage || `Create ${filePath.split('/').pop()}`,
          description: commitDesc
        });
        if (commitTarget === 'new_branch') {
          navigate(`/${repo.ownerUsername}/${repo.name}/pulls/new?head=${targetBranch}&base=${branch}`);
        } else {
          navigate(`/${repo.ownerUsername}/${repo.name}/blob/${targetBranch}/${filePath.trim()}`);
        }
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-gh-muted animate-pulse">Loading file editor...</div>;
  }

  const isRenaming = isEdit && filePath.trim() && filePath.trim() !== initialPath;

  return (
    <div className="space-y-6">
      {/* Top Bar with Filename Input */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center flex-wrap gap-2 flex-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1.5 bg-gh-surface hover:bg-gh-subtle border border-gh-border rounded text-gh-muted hover:text-gh-text"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="font-semibold text-gh-text text-sm font-mono">{repo.name} /</span>
          <input
            type="text"
            value={filePath}
            onChange={(e) => {
              const val = e.target.value;
              setFilePath(val);
              if (isEdit && val.trim() !== initialPath) {
                setCommitMessage(`Rename ${initialPath.split('/').pop()} to ${val.trim().split('/').pop()}`);
              } else if (isEdit && val.trim() === initialPath) {
                setCommitMessage(`Update ${initialPath.split('/').pop()}`);
              }
            }}
            placeholder="Name your file... (e.g. src/App.jsx)"
            className={`flex-1 max-w-md bg-gh-surface border rounded px-3 py-1.5 text-xs font-mono text-gh-text focus:outline-none transition-colors ${
              isRenaming ? 'border-amber-500/80 ring-1 ring-amber-500/40' : 'border-gh-border focus:border-gh-link'
            }`}
          />
          {isRenaming && (
            <span className="px-2 py-0.5 rounded text-[11px] bg-amber-950/80 text-amber-300 border border-amber-800 font-mono">
              Renaming from <strong className="text-white">{initialPath.split('/').pop()}</strong>
            </span>
          )}
          <span className="text-xs text-gh-muted">in <span className="font-mono font-semibold text-gh-text">{branch}</span></span>
        </div>
      </div>
      {isEdit && (
        <div className="text-[11px] text-gh-muted">
          💡 <em>Tip: You can edit the file name or path above to rename or move this file upon committing.</em>
        </div>
      )}

      {/* Editor Box */}
      <div className="border border-gh-border rounded-md bg-[#161b22] overflow-hidden">
        <div className="px-4 py-2 border-b border-gh-border bg-gh-surface flex items-center justify-between text-xs text-gh-muted">
          <span>Edit File</span>
          <span>Tab size: 2 spaces</span>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type or paste code here..."
          rows={24}
          spellCheck="false"
          className="w-full bg-[#0d1117] p-4 text-xs font-mono text-gh-text focus:outline-none resize-y selection:bg-gh-link/30"
        />
      </div>

      {/* Commit Changes Box */}
      <div className="border border-gh-border rounded-md bg-gh-surface p-5 space-y-4 text-xs">
        <h3 className="text-sm font-semibold text-gh-text flex items-center gap-2">
          <GitCommit className="w-4 h-4 text-gh-green" /> Commit changes
        </h3>

        <div className="space-y-3 max-w-2xl">
          <div>
            <label className="block text-gh-text font-medium mb-1">Commit message</label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder={isEdit ? 'Update file' : 'Create file'}
              className="w-full bg-gh-bg border border-gh-border rounded px-3 py-2 text-xs text-gh-text focus:outline-none focus:border-gh-link"
            />
          </div>

          <div>
            <label className="block text-gh-text font-medium mb-1">Extended description (optional)</label>
            <textarea
              value={commitDesc}
              onChange={(e) => setCommitDesc(e.target.value)}
              placeholder="Add an optional extended description..."
              rows={3}
              className="w-full bg-gh-bg border border-gh-border rounded px-3 py-2 text-xs text-gh-text focus:outline-none focus:border-gh-link"
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-gh-border">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="commitTarget"
                checked={commitTarget === 'direct'}
                onChange={() => setCommitTarget('direct')}
                className="text-gh-link focus:ring-0"
              />
              <span className="text-gh-text">
                Commit directly to the <strong className="font-mono">{branch}</strong> branch.
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="commitTarget"
                checked={commitTarget === 'new_branch'}
                onChange={() => setCommitTarget('new_branch')}
                className="text-gh-link focus:ring-0"
              />
              <span className="text-gh-text">
                Create a <strong>new branch</strong> for this commit and start a pull request.
              </span>
            </label>

            {commitTarget === 'new_branch' && (
              <div className="pl-6 pt-1">
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder={`patch-${Date.now().toString().slice(-4)}`}
                  className="bg-gh-bg border border-gh-border rounded px-2.5 py-1 text-xs text-gh-text font-mono focus:outline-none focus:border-gh-link"
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white font-semibold rounded-md text-xs transition-colors shadow-sm"
            >
              {submitting ? 'Committing...' : (isEdit ? 'Commit changes' : 'Commit new file')}
            </button>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-4 py-2 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded-md text-gh-text font-medium text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
