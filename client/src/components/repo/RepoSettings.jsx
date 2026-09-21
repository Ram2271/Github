import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Trash2, Globe, Lock } from 'lucide-react';
import { api } from '../../api';

export default function RepoSettings({ repo, onRepoUpdated }) {
  const navigate = useNavigate();

  const [name, setName] = useState(repo.name);
  const [description, setDescription] = useState(repo.description || '');
  const [visibility, setVisibility] = useState(repo.visibility);
  const [saving, setSaving] = useState(false);

  // Delete repo state
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.updateRepo(repo.ownerUsername, repo.name, {
        name,
        description,
        visibility
      });
      alert('Settings saved successfully!');
      if (res.repository.name !== repo.name) {
        navigate(`/${repo.ownerUsername}/${res.repository.name}/settings`);
      } else {
        onRepoUpdated(res.repository);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e) => {
    e.preventDefault();
    if (deleteConfirm !== `${repo.ownerUsername}/${repo.name}`) {
      alert(`Please type "${repo.ownerUsername}/${repo.name}" exactly to confirm deletion.`);
      return;
    }
    setDeleting(true);
    try {
      await api.deleteRepo(repo.ownerUsername, repo.name);
      navigate(`/${repo.ownerUsername}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl text-xs">
      {/* General Settings */}
      <div className="border border-gh-border rounded-md bg-gh-surface p-6 space-y-4">
        <h2 className="text-base font-semibold text-gh-text border-b border-gh-border pb-3">
          General Settings
        </h2>

        <form onSubmit={handleSaveGeneral} className="space-y-4">
          <div>
            <label className="block text-gh-text font-medium mb-1">Repository name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-md w-full bg-gh-bg border border-gh-border rounded px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-gh-link"
            />
          </div>

          <div>
            <label className="block text-gh-text font-medium mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-gh-bg border border-gh-border rounded px-3 py-2 text-xs text-gh-text focus:outline-none focus:border-gh-link"
            />
          </div>

          <div>
            <label className="block text-gh-text font-medium mb-1">Visibility</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                  className="text-gh-link focus:ring-0"
                />
                <span className="flex items-center gap-1.5 text-gh-text">
                  <Globe className="w-3.5 h-3.5 text-gh-muted" /> Public
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                  className="text-gh-link focus:ring-0"
                />
                <span className="flex items-center gap-1.5 text-gh-text">
                  <Lock className="w-3.5 h-3.5 text-gh-gold" /> Private
                </span>
              </label>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white font-semibold rounded-md shadow-sm"
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-900/60 rounded-md bg-red-950/10 p-6 space-y-4">
        <h2 className="text-base font-semibold text-red-400 border-b border-red-900/40 pb-3 flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Danger Zone
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-gh-text">Delete this repository</h3>
            <p className="text-gh-muted text-xs mt-0.5">
              Once deleted, all repository data, Filebase S3 files, commits, issues, and pull requests will be permanently erased.
            </p>
          </div>
        </div>

        <form onSubmit={handleDelete} className="space-y-3 pt-2">
          <div>
            <label className="block text-gh-muted text-[11px] mb-1">
              Please type <strong className="text-gh-text">{repo.ownerUsername}/{repo.name}</strong> to confirm:
            </label>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={`${repo.ownerUsername}/${repo.name}`}
              className="max-w-md w-full bg-gh-bg border border-red-900/50 rounded px-3 py-1.5 text-xs text-gh-text focus:outline-none focus:border-red-500 font-mono"
            />
          </div>

          <button
            type="submit"
            disabled={deleting || deleteConfirm !== `${repo.ownerUsername}/${repo.name}`}
            className="px-4 py-2 bg-gh-red hover:bg-red-700 disabled:opacity-40 text-white font-semibold rounded-md transition-colors"
          >
            {deleting ? 'Deleting repository...' : 'I understand the consequences, delete this repository'}
          </button>
        </form>
      </div>
    </div>
  );
}
