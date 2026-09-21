import React, { useState, useRef } from 'react';
import { Upload, FolderUp, FileUp, X, Check, AlertCircle } from 'lucide-react';
import { api } from '../../api';

export default function FolderUploader({ repo, branch, onClose, onSuccess }) {
  const [selectedFiles, setSelectedFiles] = useState([]); // [{ file, path }]
  const [commitMessage, setCommitMessage] = useState('Upload files');
  const [commitDesc, setCommitDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  // File selection handlers
  const handleFilesChosen = (e) => {
    const files = Array.from(e.target.files || []);
    addFiles(files);
  };

  const addFiles = (files) => {
    const newItems = files.map(f => {
      const relPath = f.webkitRelativePath || f.name;
      return { file: f, path: relPath };
    });
    setSelectedFiles(prev => [...prev, ...newItems]);
    if (!commitMessage || commitMessage === 'Upload files') {
      setCommitMessage(`Upload ${files.length} file${files.length > 1 ? 's' : ''}`);
    }
  };

  // Drag & drop folder traversal using webkitGetAsEntry
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const items = e.dataTransfer.items;
    if (!items) return;

    const filesFound = [];

    async function traverseEntry(entry, currentPath = '') {
      if (entry.isFile) {
        return new Promise((resolve) => {
          entry.file((f) => {
            filesFound.push({
              file: f,
              path: currentPath ? `${currentPath}/${f.name}` : f.name
            });
            resolve();
          });
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const readEntries = () => {
          return new Promise((resolve) => {
            dirReader.readEntries(async (entries) => {
              if (entries.length === 0) {
                resolve();
              } else {
                for (const child of entries) {
                  await traverseEntry(child, currentPath ? `${currentPath}/${entry.name}` : entry.name);
                }
                await readEntries();
                resolve();
              }
            });
          });
        };
        await readEntries();
      }
    }

    const promises = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          promises.push(traverseEntry(entry));
        }
      }
    }

    await Promise.all(promises);
    setSelectedFiles(prev => [...prev, ...filesFound]);
    setCommitMessage(`Upload ${filesFound.length} file${filesFound.length > 1 ? 's' : ''}`);
  };

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      setError('Please select files or a folder to upload.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('branch', branch);
      formData.append('message', commitMessage.trim() || 'Upload files');
      formData.append('description', commitDesc.trim());

      const paths = [];
      selectedFiles.forEach((item) => {
        formData.append('files', item.file);
        paths.push(item.path);
      });
      formData.append('paths', JSON.stringify(paths));

      await api.uploadFiles(repo.ownerUsername, repo.name, formData);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-gh-surface border border-gh-border rounded-xl max-w-2xl w-full p-6 space-y-6 text-xs shadow-2xl">
        <div className="flex items-center justify-between border-b border-gh-border pb-3">
          <div>
            <h2 className="text-base font-semibold text-gh-text">Upload files &amp; complete folders</h2>
            <p className="text-gh-muted text-xs mt-0.5">
              Files will be stored in Filebase S3 preserving their complete directory hierarchy.
            </p>
          </div>
          <button onClick={onClose} className="text-gh-muted hover:text-gh-text p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-950/40 border border-red-900/60 rounded text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Drag & Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
            dragActive
              ? 'border-gh-link bg-gh-link/10 scale-[1.01]'
              : 'border-gh-border bg-gh-bg/50 hover:border-gh-muted'
          }`}
        >
          <Upload className="w-10 h-10 text-gh-muted mx-auto mb-3" />
          <p className="font-semibold text-gh-text text-sm mb-1">
            Drag and drop files or complete folders here
          </p>
          <p className="text-gh-muted text-xs mb-4">
            Folder structure and relative paths will be preserved automatically.
          </p>

          <div className="flex items-center justify-center gap-3">
            {/* Choose files */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border text-gh-text rounded-md font-medium flex items-center gap-1.5"
            >
              <FileUp className="w-4 h-4 text-gh-link" /> Choose files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFilesChosen}
              className="hidden"
            />

            {/* Choose entire folder */}
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="px-3.5 py-1.5 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border text-gh-text rounded-md font-medium flex items-center gap-1.5"
            >
              <FolderUp className="w-4 h-4 text-amber-400" /> Choose complete folder
            </button>
            <input
              ref={folderInputRef}
              type="file"
              // @ts-ignore
              webkitdirectory="true"
              directory="true"
              multiple
              onChange={handleFilesChosen}
              className="hidden"
            />
          </div>
        </div>

        {/* Selected Files List Preview */}
        {selectedFiles.length > 0 && (
          <div className="border border-gh-border rounded-md bg-gh-bg overflow-hidden">
            <div className="px-4 py-2 border-b border-gh-border bg-gh-surface flex items-center justify-between font-semibold text-gh-text">
              <span>{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} queued for upload</span>
              <button
                type="button"
                onClick={() => setSelectedFiles([])}
                className="text-gh-red hover:underline font-normal text-[11px]"
              >
                Clear all
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-gh-border/40 p-1 font-mono text-[11px]">
              {selectedFiles.map((item, idx) => (
                <div key={idx} className="px-3 py-1.5 flex items-center justify-between gap-2 hover:bg-gh-subtle/40">
                  <span className="text-gh-text truncate">{item.path}</span>
                  <div className="flex items-center gap-2 flex-shrink-0 text-gh-muted">
                    <span>{(item.file.size / 1024).toFixed(1)} KB</span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-gh-muted hover:text-gh-red"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commit Details Form */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div>
            <label className="block text-gh-text font-medium mb-1">Commit message</label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Upload files"
              className="w-full bg-gh-bg border border-gh-border rounded px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
            />
          </div>

          <div>
            <label className="block text-gh-text font-medium mb-1">Extended description (optional)</label>
            <textarea
              value={commitDesc}
              onChange={(e) => setCommitDesc(e.target.value)}
              placeholder="Add an optional extended description..."
              rows={2}
              className="w-full bg-gh-bg border border-gh-border rounded px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gh-border">
            <span className="text-gh-muted">Target branch: <strong className="text-gh-text font-mono">{branch}</strong></span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={uploading}
                className="px-4 py-2 bg-gh-subtle hover:bg-gh-subtle/80 border border-gh-border rounded-md text-gh-text font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading || selectedFiles.length === 0}
                className="px-5 py-2 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white font-semibold rounded-md shadow-sm flex items-center gap-2"
              >
                {uploading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Uploading to Filebase...</span>
                  </>
                ) : (
                  <span>Commit changes</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
