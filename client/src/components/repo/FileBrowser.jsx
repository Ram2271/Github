import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GitBranch, Folder, FileText, Plus, Upload, Check, ChevronDown, Clock, Search, FileEdit, Trash2, Download, Smartphone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import MarkdownViewer from './MarkdownViewer';
import ApkBuilderModal from './ApkBuilderModal';

export default function FileBrowser({
  repo,
  branch,
  branches,
  subpath,
  treeData,
  onBranchChange,
  onOpenUploadModal,
  onRefresh,
  onBranchDeleted,
  isOwner
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [branchDropdown, setBranchDropdown] = useState(false);
  const [addFileDropdown, setAddFileDropdown] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [apkModalOpen, setApkModalOpen] = useState(false);

  const hasIndexHtml = Boolean(
    treeData?.hasIndexHtml ||
    (treeData?.items || []).some(i => i.name?.toLowerCase() === 'index.html')
  );

  const handleDownloadZip = async () => {
    if (downloadingZip) return;
    setDownloadingZip(true);
    try {
      await api.downloadRepoZip(repo.ownerUsername, repo.name, branch);
    } catch (err) {
      alert(err.message);
    } finally {
      setDownloadingZip(false);
    }
  };

  // Rename modal state
  const [renameTarget, setRenameTarget] = useState(null); // { path, name, type }
  const [newTargetName, setNewTargetName] = useState('');
  const [targetRenameMsg, setTargetRenameMsg] = useState('');
  const [renamingTarget, setRenamingTarget] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null); // { path, name, type }
  const [targetDeleteMsg, setTargetDeleteMsg] = useState('');
  const [deletingTarget, setDeletingTarget] = useState(false);

  const branchRef = useRef(null);
  const addFileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (branchRef.current && !branchRef.current.contains(e.target)) {
        setBranchDropdown(false);
      }
      if (addFileRef.current && !addFileRef.current.contains(e.target)) {
        setAddFileDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateBranch = async (e) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    setCreatingBranch(true);
    try {
      await api.createBranch(repo.ownerUsername, repo.name, {
        name: newBranchName.trim(),
        sourceBranch: branch
      });
      setBranchDropdown(false);
      setNewBranchName('');
      onBranchChange(newBranchName.trim());
    } catch (err) {
      alert(err.message);
    } finally {
      setCreatingBranch(false);
    }
  };

  const handleRenameSubmit = async (e) => {
    e.preventDefault();
    if (!newTargetName.trim() || newTargetName.trim() === renameTarget?.path) {
      alert('Please enter a valid, new path.');
      return;
    }
    setRenamingTarget(true);
    try {
      await api.renameFile(repo.ownerUsername, repo.name, {
        oldPath: renameTarget.path,
        newPath: newTargetName.trim(),
        branch,
        message: targetRenameMsg.trim() || `Rename ${renameTarget.name} to ${newTargetName.trim().split('/').pop()}`
      });
      setRenameTarget(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setRenamingTarget(false);
    }
  };

  const handleDeleteSubmit = async (e) => {
    e.preventDefault();
    setDeletingTarget(true);
    try {
      await api.deleteFile(repo.ownerUsername, repo.name, {
        path: deleteTarget.path,
        branch,
        message: targetDeleteMsg.trim() || `Delete ${deleteTarget.name}`
      });
      setDeleteTarget(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setDeletingTarget(false);
    }
  };

  const handleDeleteBranch = async (b, e) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete branch "${b}"?`)) return;
    try {
      await api.deleteBranch(repo.ownerUsername, repo.name, b);
      if (onBranchDeleted) onBranchDeleted(b);
    } catch (err) {
      alert(err.message);
    }
  };

  const filteredBranches = (branches || []).filter(b =>
    b.toLowerCase().includes(branchFilter.toLowerCase())
  );

  const pathSegments = subpath ? subpath.split('/').filter(Boolean) : [];

  return (
    <div className="space-y-4">
      {/* Top Bar: Branch Selector, Breadcrumbs, Add File button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center flex-wrap gap-2 text-xs sm:text-sm">
          {/* Branch Dropdown */}
          <div className="relative" ref={branchRef}>
            <button
              onClick={() => setBranchDropdown(!branchDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gh-surface hover:bg-gh-subtle border border-gh-border hover:border-gh-muted rounded-md text-xs font-semibold text-gh-text transition-colors"
            >
              <GitBranch className="w-3.5 h-3.5 text-gh-muted" />
              <span className="font-mono">{branch}</span>
              <ChevronDown className="w-3 h-3 text-gh-muted" />
            </button>

            {branchDropdown && (
              <div className="absolute left-0 mt-2 w-72 bg-gh-surface border border-gh-border rounded-md shadow-2xl z-50 overflow-hidden text-xs">
                <div className="p-2 border-b border-gh-border">
                  <div className="font-semibold text-gh-text mb-2">Switch branches / tags</div>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gh-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={branchFilter}
                      onChange={(e) => setBranchFilter(e.target.value)}
                      placeholder="Filter branches..."
                      className="w-full bg-gh-bg border border-gh-border rounded pl-8 pr-2 py-1 text-xs text-gh-text placeholder:text-gh-muted focus:outline-none focus:border-gh-link"
                    />
                  </div>
                </div>

                <div className="max-h-56 overflow-y-auto divide-y divide-gh-border">
                  {filteredBranches.map(b => (
                    <div key={b} className="flex items-center justify-between hover:bg-gh-subtle pr-2">
                      <button
                        onClick={() => {
                          onBranchChange(b);
                          setBranchDropdown(false);
                        }}
                        className="flex-1 px-3 py-2 text-left flex items-center justify-between font-mono"
                      >
                        <span className={b === branch ? 'font-bold text-white' : 'text-gh-text'}>{b}</span>
                        {b === branch && <Check className="w-4 h-4 text-gh-green" />}
                      </button>
                      {isOwner && b !== (repo.defaultBranch || 'main') && (
                        <button
                          title={`Delete branch ${b}`}
                          onClick={(e) => handleDeleteBranch(b, e)}
                          className="p-1 text-gh-muted hover:text-gh-red rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {filteredBranches.length === 0 && (
                    <div className="p-3 text-center text-gh-muted">No branches found</div>
                  )}
                </div>

                {isOwner && (
                  <form onSubmit={handleCreateBranch} className="p-2 border-t border-gh-border bg-gh-subtle/40">
                    <div className="text-[11px] text-gh-muted mb-1">Create branch from &ldquo;{branch}&rdquo;:</div>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        placeholder="new-branch-name"
                        className="flex-1 bg-gh-bg border border-gh-border rounded px-2 py-1 text-xs text-gh-text focus:outline-none focus:border-gh-link"
                      />
                      <button
                        type="submit"
                        disabled={creatingBranch || !newBranchName.trim()}
                        className="px-2.5 py-1 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white rounded text-xs font-semibold transition-colors"
                      >
                        Create
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Breadcrumb path */}
          <div className="flex items-center gap-1 font-semibold text-gh-text">
            <Link
              to={`/${repo.ownerUsername}/${repo.name}`}
              className="text-gh-link hover:underline"
            >
              {repo.name}
            </Link>
            {pathSegments.map((segment, idx) => {
              const currentPath = pathSegments.slice(0, idx + 1).join('/');
              const isLast = idx === pathSegments.length - 1;
              return (
                <React.Fragment key={currentPath}>
                  <span className="text-gh-muted">/</span>
                  {isLast ? (
                    <span className="text-gh-text">{segment}</span>
                  ) : (
                    <Link
                      to={`/${repo.ownerUsername}/${repo.name}/tree/${branch}/${currentPath}`}
                      className="text-gh-link hover:underline"
                    >
                      {segment}
                    </Link>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Right Buttons: Download Source Code (.ZIP) + Add file / Upload */}
        <div className="flex items-center gap-2" ref={addFileRef}>
          {isOwner && (
            <div className="relative">
              <button
                onClick={() => setAddFileDropdown(!addFileDropdown)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gh-surface hover:bg-gh-subtle border border-gh-border hover:border-gh-muted rounded-md text-xs font-semibold text-gh-text transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add file</span>
                <ChevronDown className="w-3 h-3 text-gh-muted" />
              </button>

              {addFileDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-gh-surface border border-gh-border rounded-md shadow-2xl py-1 z-50 text-xs">
                  <Link
                    to={`/${repo.ownerUsername}/${repo.name}/new/${branch}/${subpath ? subpath + '/' : ''}`}
                    onClick={() => setAddFileDropdown(false)}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gh-subtle text-gh-text"
                  >
                    <Plus className="w-3.5 h-3.5 text-gh-muted" />
                    <span>Create new file</span>
                  </Link>
                  <button
                    onClick={() => {
                      setAddFileDropdown(false);
                      onOpenUploadModal();
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-gh-subtle text-gh-text border-t border-gh-border"
                  >
                    <Upload className="w-3.5 h-3.5 text-gh-muted" />
                    <span>Upload files / folder</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {hasIndexHtml && (
            <button
              onClick={() => setApkModalOpen(true)}
              title="Convert index.html and web assets into a signed Android APK and commit to repo"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Build APK</span>
            </button>
          )}

          <button
            onClick={handleDownloadZip}
            disabled={downloadingZip}
            title={`Download all source code (${repo.name}-${branch}.zip)`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gh-green hover:bg-gh-greenHover disabled:opacity-60 text-white rounded-md text-xs font-semibold shadow-sm transition-colors"
          >
            <Download className={`w-3.5 h-3.5 ${downloadingZip ? 'animate-bounce' : ''}`} />
            <span>{downloadingZip ? 'Preparing ZIP...' : 'Download Source Code (.ZIP)'}</span>
          </button>
        </div>
      </div>

      {/* Auto-Detected index.html -> Android APK Builder Banner */}
      {hasIndexHtml && (
        <div className="bg-emerald-950/25 border border-emerald-700/40 rounded-md px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <span className="font-semibold text-white">Web App Detected (</span>
              <code className="text-emerald-400 font-mono">{treeData?.indexHtmlPath || 'index.html'}</code>
              <span className="font-semibold text-white">)</span>
              <span className="text-gh-muted ml-1.5">
                — Convert this repository into a signed Android <code className="text-gh-text font-mono">.apk</code> and automatically add it to your repo.
              </span>
            </div>
          </div>
          <button
            onClick={() => setApkModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md font-semibold whitespace-nowrap transition-colors shadow-sm"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Build Android APK</span>
          </button>
        </div>
      )}

      {/* Latest Commit Bar */}
      {treeData?.latestCommit && (
        <div className="bg-gh-subtle/50 border border-gh-border rounded-t-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={treeData.latestCommit.author?.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${treeData.latestCommit.author?.username}`}
              alt=""
              className="w-5 h-5 rounded-full object-cover bg-gh-subtle"
            />
            <span className="font-semibold text-gh-text">{treeData.latestCommit.author?.username}</span>
            <span className="text-gh-muted truncate">{treeData.latestCommit.message}</span>
          </div>
          <div className="flex items-center gap-3 text-gh-muted whitespace-nowrap">
            <span className="font-mono text-[11px] bg-gh-subtle px-1.5 py-0.5 rounded border border-gh-border text-gh-text">
              {treeData.latestCommit.shortSha || treeData.latestCommit.sha?.substring(0, 7)}
            </span>
            <span>
              {treeData.latestCommit.createdAt && (
                formatDistanceToNow(new Date(treeData.latestCommit.createdAt), { addSuffix: true })
              )}
            </span>
          </div>
        </div>
      )}

      {/* File Tree Table */}
      <div className={`border border-gh-border bg-gh-surface overflow-hidden text-xs ${treeData?.latestCommit ? 'border-t-0 rounded-b-md' : 'rounded-md'}`}>
        {subpath && (
          <div className="px-4 py-2.5 border-b border-gh-border/60 bg-gh-subtle/20 hover:bg-gh-subtle/50 transition-colors">
            <Link
              to={`/${repo.ownerUsername}/${repo.name}/tree/${branch}/${pathSegments.slice(0, -1).join('/')}`}
              className="text-gh-link font-semibold hover:underline flex items-center gap-2"
            >
              <span>..</span>
            </Link>
          </div>
        )}

        <div className="divide-y divide-gh-border/60">
          {(treeData?.items || []).map((item) => {
            const isDir = item.type === 'directory';
            const itemUrl = isDir
              ? `/${repo.ownerUsername}/${repo.name}/tree/${branch}/${item.path}`
              : `/${repo.ownerUsername}/${repo.name}/blob/${branch}/${item.path}`;

            return (
              <div
                key={item.path}
                className="px-4 py-2.5 flex items-center justify-between gap-4 hover:bg-gh-subtle/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-[200px] flex-1">
                  {isDir ? (
                    <Folder className="w-4 h-4 text-sky-400 fill-sky-400/20 flex-shrink-0" />
                  ) : item.name?.toLowerCase().endsWith('.apk') ? (
                    <Smartphone className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-gh-muted flex-shrink-0" />
                  )}
                  <Link
                    to={itemUrl}
                    className="text-gh-text hover:text-gh-link hover:underline font-medium truncate"
                  >
                    {item.name}
                  </Link>
                  {item.name?.toLowerCase().endsWith('.apk') && (
                    <a
                      href={`/api/files/${repo.ownerUsername}/${repo.name}/raw/${branch}/${item.path}`}
                      download={item.name}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 rounded text-[10px] font-semibold transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download APK</span>
                    </a>
                  )}
                </div>

                <div className="hidden sm:block text-gh-muted text-xs truncate flex-1 max-w-md">
                  {item.lastCommitMessage || 'Update'}
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-gh-muted text-right whitespace-nowrap text-[11px]">
                    {item.lastCommitDate ? (
                      formatDistanceToNow(new Date(item.lastCommitDate), { addSuffix: true })
                    ) : (
                      'recently'
                    )}
                  </div>

                  {isOwner && (
                    <div className="flex items-center gap-1 opacity-75 hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setRenameTarget(item);
                          setNewTargetName(item.path);
                          setTargetRenameMsg(`Rename ${item.name} to `);
                        }}
                        title={`Rename / move ${isDir ? 'folder' : 'file'}`}
                        className="p-1 hover:bg-gh-subtle text-gh-muted hover:text-amber-400 rounded transition-colors"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteTarget(item);
                          setTargetDeleteMsg(`Delete ${item.name}`);
                        }}
                        title={`Delete ${isDir ? 'folder' : 'file'}`}
                        className="p-1 hover:bg-gh-subtle text-gh-muted hover:text-red-400 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {(!treeData?.items || treeData.items.length === 0) && (
            <div className="p-8 text-center text-gh-muted">
              <p className="font-semibold text-gh-text mb-1">This repository is empty</p>
              <p className="text-xs">Create or upload files to get started.</p>
            </div>
          )}
        </div>
      </div>

      {/* README Renderer */}
      {treeData?.readme && (
        <div className="border border-gh-border rounded-md bg-gh-surface overflow-hidden mt-6">
          <div className="px-4 py-2.5 border-b border-gh-border bg-gh-subtle/50 flex items-center gap-2 text-xs font-semibold text-gh-text">
            <FileText className="w-4 h-4 text-gh-muted" />
            <span>{treeData.readme.path}</span>
          </div>
          <div className="p-6 sm:p-8">
            <MarkdownViewer content={treeData.readme.content} />
          </div>
        </div>
      )}

      {/* Rename File/Folder Modal */}
      {renameTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gh-surface border border-gh-border rounded-lg max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <h3 className="text-sm font-semibold text-gh-text flex items-center gap-2">
              <FileEdit className="w-4 h-4 text-amber-400" />
              Rename / Move {renameTarget.type === 'directory' ? 'Folder' : 'File'}
            </h3>
            <p className="text-gh-muted">
              Rename or move <strong className="text-gh-text">{renameTarget.path}</strong>. All nested files will be updated automatically.
            </p>
            <form onSubmit={handleRenameSubmit} className="space-y-3">
              <div>
                <label className="block text-gh-text font-medium mb-1">New path / name</label>
                <input
                  type="text"
                  value={newTargetName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewTargetName(val);
                    setTargetRenameMsg(`Rename ${renameTarget.name} to ${val.split('/').pop()}`);
                  }}
                  required
                  placeholder="e.g. src/utils"
                  className="w-full bg-gh-bg border border-gh-border rounded px-3 py-1.5 text-xs font-mono text-gh-text focus:outline-none focus:border-gh-link"
                />
              </div>
              <div>
                <label className="block text-gh-text font-medium mb-1">Commit message</label>
                <input
                  type="text"
                  value={targetRenameMsg}
                  onChange={(e) => setTargetRenameMsg(e.target.value)}
                  placeholder={`Rename ${renameTarget.name}`}
                  className="w-full bg-gh-bg border border-gh-border rounded px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenameTarget(null)}
                  className="px-3 py-1.5 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded text-gh-text font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renamingTarget || !newTargetName.trim() || newTargetName.trim() === renameTarget.path}
                  className="px-3 py-1.5 bg-gh-green hover:bg-gh-greenHover text-white font-semibold rounded disabled:opacity-50"
                >
                  {renamingTarget ? 'Renaming...' : 'Commit rename'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete File/Folder Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gh-surface border border-gh-border rounded-lg max-w-md w-full p-6 space-y-4 shadow-2xl text-xs">
            <h3 className="text-sm font-semibold text-gh-text flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-gh-red" />
              Delete {deleteTarget.type === 'directory' ? 'Folder' : 'File'}
            </h3>
            <p className="text-gh-muted">
              Are you sure you want to delete <strong className="text-gh-text">{deleteTarget.path}</strong>?
              {deleteTarget.type === 'directory' && ' All files inside this folder will be deleted.'}
            </p>
            <form onSubmit={handleDeleteSubmit} className="space-y-3">
              <div>
                <label className="block text-gh-text font-medium mb-1">Commit message</label>
                <input
                  type="text"
                  value={targetDeleteMsg}
                  onChange={(e) => setTargetDeleteMsg(e.target.value)}
                  placeholder={`Delete ${deleteTarget.name}`}
                  className="w-full bg-gh-bg border border-gh-border rounded px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-3 py-1.5 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded text-gh-text font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deletingTarget}
                  className="px-3 py-1.5 bg-gh-red hover:bg-red-700 text-white font-semibold rounded disabled:opacity-50"
                >
                  {deletingTarget ? 'Deleting...' : 'Commit delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* APK Builder Modal */}
      {apkModalOpen && (
        <ApkBuilderModal
          repo={repo}
          branch={branch}
          subpath={subpath}
          indexHtmlPath={treeData?.indexHtmlPath || 'index.html'}
          onClose={() => setApkModalOpen(false)}
          onSuccess={() => {
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </div>
  );
}
