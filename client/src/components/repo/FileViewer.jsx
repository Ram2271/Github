import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Copy, Check, Edit2, Trash2, Download, ExternalLink, FileEdit } from 'lucide-react';
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-bash';
import { api } from '../../api';

export default function FileViewer({ repo, branch, filePath, isOwner }) {
  const navigate = useNavigate();
  const [fileData, setFileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Rename state
  const [renameModal, setRenameModal] = useState(false);
  const [newPath, setNewPath] = useState(filePath);
  const [renameMessage, setRenameMessage] = useState('');
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    async function loadFile() {
      setLoading(true);
      try {
        const data = await api.getBlob(repo.ownerUsername, repo.name, branch, filePath);
        setFileData(data);
      } catch (err) {
        alert(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadFile();
  }, [repo, branch, filePath]);

  useEffect(() => {
    if (fileData && !fileData.isBinary) {
      Prism.highlightAll();
    }
  }, [fileData]);

  const handleCopy = () => {
    if (!fileData?.content) return;
    navigator.clipboard.writeText(fileData.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    setDeleting(true);
    try {
      await api.deleteFile(repo.ownerUsername, repo.name, {
        path: filePath,
        branch,
        message: deleteMessage || `Delete ${filePath}`
      });
      setDeleteModal(false);
      navigate(`/${repo.ownerUsername}/${repo.name}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!newPath.trim() || newPath.trim() === filePath) {
      alert('Please enter a new, distinct file path.');
      return;
    }
    setRenaming(true);
    try {
      const res = await api.renameFile(repo.ownerUsername, repo.name, {
        oldPath: filePath,
        newPath: newPath.trim(),
        branch,
        message: renameMessage.trim() || `Rename ${filePath} to ${newPath.trim()}`
      });
      setRenameModal(false);
      navigate(`/${repo.ownerUsername}/${repo.name}/blob/${branch}/${res.newPath || newPath.trim()}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setRenaming(false);
    }
  };

  const lines = fileData?.content ? fileData.content.split('\n') : [];
  const pathSegments = filePath.split('/');
  const rawUrl = `/api/files/${repo.ownerUsername}/${repo.name}/raw/${branch}/${filePath}`;

  if (loading) {
    return (
      <div className="p-12 text-center text-gh-muted animate-pulse">
        Loading file...
      </div>
    );
  }

  if (!fileData) {
    return (
      <div className="p-12 text-center text-gh-muted">
        File not found.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* File Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gh-surface border border-gh-border rounded-t-md p-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <FileText className="w-4 h-4 text-gh-muted" />
          <div className="flex items-center gap-1 font-semibold text-gh-text">
            <Link to={`/${repo.ownerUsername}/${repo.name}`} className="text-gh-link hover:underline">
              {repo.name}
            </Link>
            {pathSegments.map((s, idx) => (
              <React.Fragment key={idx}>
                <span className="text-gh-muted">/</span>
                {idx === pathSegments.length - 1 ? (
                  <span>{s}</span>
                ) : (
                  <Link
                    to={`/${repo.ownerUsername}/${repo.name}/tree/${branch}/${pathSegments.slice(0, idx + 1).join('/')}`}
                    className="text-gh-link hover:underline"
                  >
                    {s}
                  </Link>
                )}
              </React.Fragment>
            ))}
          </div>

          <span className="text-gh-muted">|</span>
          <span className="text-gh-muted">{lines.length} lines</span>
          <span className="text-gh-muted">|</span>
          <span className="text-gh-muted">{(fileData.size / 1024).toFixed(1)} KB</span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <a
            href={rawUrl}
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-1 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded text-gh-text hover:text-white font-medium flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Raw
          </a>

          {!fileData.isBinary && (
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded text-gh-text hover:text-white font-medium flex items-center gap-1"
            >
              {copied ? <Check className="w-3 h-3 text-gh-green" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}

          {isOwner && (
            <>
              <button
                onClick={() => {
                  setNewPath(filePath);
                  setRenameMessage(`Rename ${filePath.split('/').pop()} to `);
                  setRenameModal(true);
                }}
                title="Rename or move this file"
                className="px-2.5 py-1 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded text-gh-text hover:text-white font-medium flex items-center gap-1"
              >
                <FileEdit className="w-3 h-3 text-amber-400" /> Rename
              </button>
              <Link
                to={`/${repo.ownerUsername}/${repo.name}/edit/${branch}/${filePath}`}
                className="px-2.5 py-1 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded text-gh-text hover:text-white font-medium flex items-center gap-1"
              >
                <Edit2 className="w-3 h-3" /> Edit
              </Link>
              <button
                onClick={() => setDeleteModal(true)}
                title="Delete this file"
                className="px-2.5 py-1 bg-gh-subtle hover:bg-gh-red/20 border border-gh-border rounded text-gh-red font-medium flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content Viewer */}
      <div className="border border-gh-border border-t-0 rounded-b-md bg-[#161b22] overflow-x-auto">
        {fileData.isBinary ? (
          <div className="p-8 text-center">
            {fileData.contentType?.startsWith('image/') ? (
              <img src={rawUrl} alt={filePath} className="max-w-full max-h-[600px] mx-auto rounded border border-gh-border" />
            ) : (
              <div className="text-gh-muted">
                <p className="mb-3">Binary file not shown.</p>
                <a
                  href={rawUrl}
                  download={filePath.split('/').pop()}
                  className="px-4 py-2 bg-gh-green hover:bg-gh-greenHover text-white rounded text-xs font-semibold inline-flex items-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download File
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="flex font-mono text-xs leading-5">
            {/* Line Numbers */}
            <div className="py-4 pl-4 pr-3 text-right text-gh-muted select-none border-r border-gh-border bg-gh-bg/50">
              {lines.map((_, i) => (
                <div key={i} className="leading-5">{i + 1}</div>
              ))}
            </div>

            {/* Code lines */}
            <div className="py-4 px-4 flex-1 overflow-x-auto">
              <pre className="!bg-transparent !p-0 !m-0">
                <code className={`language-${getLanguage(filePath)}`}>
                  {fileData.content}
                </code>
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gh-surface border border-gh-border rounded-lg max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <h3 className="text-sm font-semibold text-gh-text flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-gh-red" /> Delete {filePath.split('/').pop()}
            </h3>
            <p className="text-gh-muted">
              Are you sure you want to delete <strong className="text-gh-text">{filePath}</strong>? A commit will be recorded on <span className="font-mono text-gh-text">{branch}</span>.
            </p>
            <form onSubmit={handleDelete} className="space-y-3">
              <div>
                <label className="block text-gh-text font-medium mb-1">Commit message</label>
                <input
                  type="text"
                  value={deleteMessage}
                  onChange={(e) => setDeleteMessage(e.target.value)}
                  placeholder={`Delete ${filePath.split('/').pop()}`}
                  className="w-full bg-gh-bg border border-gh-border rounded px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteModal(false)}
                  className="px-3 py-1.5 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded text-gh-text font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting}
                  className="px-3 py-1.5 bg-gh-red hover:bg-red-700 text-white font-semibold rounded disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Commit changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename File / Move Modal */}
      {renameModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gh-surface border border-gh-border rounded-lg max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <h3 className="text-sm font-semibold text-gh-text flex items-center gap-2">
              <FileEdit className="w-4 h-4 text-amber-400" /> Rename / Move File
            </h3>
            <p className="text-gh-muted">
              Change the path or filename. You can move files between directories by specifying subpaths (e.g. <span className="font-mono text-gh-text">src/components/NewFile.js</span>).
            </p>
            <form onSubmit={handleRename} className="space-y-3">
              <div>
                <label className="block text-gh-text font-medium mb-1">New file path</label>
                <input
                  type="text"
                  value={newPath}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewPath(val);
                    setRenameMessage(`Rename ${filePath.split('/').pop()} to ${val.split('/').pop()}`);
                  }}
                  required
                  placeholder="e.g. src/new-name.js"
                  className="w-full bg-gh-bg border border-gh-border rounded px-3 py-1.5 text-xs font-mono text-gh-text focus:outline-none focus:border-gh-link"
                />
              </div>
              <div>
                <label className="block text-gh-text font-medium mb-1">Commit message</label>
                <input
                  type="text"
                  value={renameMessage}
                  onChange={(e) => setRenameMessage(e.target.value)}
                  placeholder={`Rename ${filePath.split('/').pop()}`}
                  className="w-full bg-gh-bg border border-gh-border rounded px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenameModal(false)}
                  className="px-3 py-1.5 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded text-gh-text font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renaming || !newPath.trim() || newPath.trim() === filePath}
                  className="px-3 py-1.5 bg-gh-green hover:bg-gh-greenHover text-white font-semibold rounded disabled:opacity-50"
                >
                  {renaming ? 'Renaming...' : 'Commit rename'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function getLanguage(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': case 'mjs': case 'cjs': return 'javascript';
    case 'jsx': return 'jsx';
    case 'ts': case 'tsx': return 'typescript';
    case 'py': return 'python';
    case 'css': return 'css';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'sh': case 'bash': return 'bash';
    case 'html': return 'markup';
    default: return 'none';
  }
}
