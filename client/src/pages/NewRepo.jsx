import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Globe, Lock, Shield, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

export default function NewRepo() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [initReadme, setInitReadme] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  if (!user) {
    return (
      <div className="max-w-xl mx-auto p-12 text-center text-xs space-y-4">
        <p className="text-gh-text text-sm">You must be signed in to create a repository.</p>
        <button
          onClick={() => navigate('/login')}
          className="px-4 py-2 bg-gh-green hover:bg-gh-greenHover text-white font-semibold rounded-md"
        >
          Sign in
        </button>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please provide a repository name.');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const res = await api.createRepo({
        name: name.trim(),
        description: description.trim(),
        visibility,
        initReadme
      });
      navigate(`/${res.repository.ownerUsername}/${res.repository.name}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 text-xs text-gh-text space-y-6">
      <div className="border-b border-gh-border pb-4">
        <h1 className="text-2xl font-bold text-white mb-1">Create a new repository</h1>
        <p className="text-gh-muted">
          A repository contains all project files, revision history, and Filebase S3 references.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-950/40 border border-red-900/60 rounded text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Owner & Repo Name */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div>
            <label className="block text-gh-text font-semibold mb-1">Owner</label>
            <div className="bg-gh-surface border border-gh-border rounded px-3 py-1.5 font-semibold text-gh-text">
              {user.username}
            </div>
          </div>

          <span className="text-lg text-gh-muted pb-1 hidden sm:inline">/</span>

          <div className="flex-1">
            <label className="block text-gh-text font-semibold mb-1">Repository name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. awesome-web-project"
              required
              className="w-full bg-gh-bg border border-gh-border rounded px-3 py-1.5 text-xs text-gh-text font-mono focus:outline-none focus:border-gh-link"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-gh-text font-semibold mb-1">
            Description <span className="text-gh-muted font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description of your repository"
            className="w-full bg-gh-bg border border-gh-border rounded px-3 py-2 text-xs text-gh-text focus:outline-none focus:border-gh-link"
          />
        </div>

        {/* Visibility */}
        <div className="space-y-3 pt-3 border-t border-gh-border">
          <label className="flex items-start gap-3 p-3 border border-gh-border rounded-lg bg-gh-surface hover:bg-gh-subtle/50 cursor-pointer transition-colors">
            <input
              type="radio"
              name="visibility"
              value="public"
              checked={visibility === 'public'}
              onChange={() => setVisibility('public')}
              className="mt-0.5 text-gh-link focus:ring-0"
            />
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-gh-text">
                <Globe className="w-4 h-4 text-gh-muted" /> Public
              </div>
              <p className="text-gh-muted text-[11px] mt-0.5">
                Anyone on the internet can see this repository. You choose who can commit.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3 border border-gh-border rounded-lg bg-gh-surface hover:bg-gh-subtle/50 cursor-pointer transition-colors">
            <input
              type="radio"
              name="visibility"
              value="private"
              checked={visibility === 'private'}
              onChange={() => setVisibility('private')}
              className="mt-0.5 text-gh-link focus:ring-0"
            />
            <div>
              <div className="flex items-center gap-1.5 font-semibold text-gh-text">
                <Lock className="w-4 h-4 text-gh-gold" /> Private
              </div>
              <p className="text-gh-muted text-[11px] mt-0.5">
                You choose who can see and commit to this repository.
              </p>
            </div>
          </label>
        </div>

        {/* Initialize with README */}
        <div className="pt-3 border-t border-gh-border">
          <div className="font-semibold text-gh-text mb-2">Initialize this repository with:</div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={initReadme}
              onChange={(e) => setInitReadme(e.target.checked)}
              className="mt-0.5 rounded border-gh-border text-gh-link focus:ring-0"
            />
            <div>
              <div className="font-medium text-gh-text">Add a README file</div>
              <p className="text-gh-muted text-[11px]">
                This is where you can write a long description for your project.
              </p>
            </div>
          </label>
        </div>

        {/* Submit */}
        <div className="pt-4 border-t border-gh-border">
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="px-5 py-2.5 bg-gh-green hover:bg-gh-greenHover disabled:opacity-50 text-white font-semibold rounded-md shadow-sm transition-colors text-xs flex items-center gap-2"
          >
            {creating ? 'Creating repository on Filebase & MongoDB...' : 'Create repository'}
          </button>
        </div>
      </form>
    </div>
  );
}
