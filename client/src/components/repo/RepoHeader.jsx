import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Code, CircleDot, GitPullRequest, GitCommit, Settings, Play, Star, GitFork, Eye, Lock, Globe } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

export default function RepoHeader({ repo, counts, activeTab, isStarred: initialStarred, isOwner }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [isStarred, setIsStarred] = useState(initialStarred);
  const [starsCount, setStarsCount] = useState(counts?.stars || 0);
  const [forking, setForking] = useState(false);

  const handleStar = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      const res = await api.toggleStar(repo.ownerUsername, repo.name);
      setIsStarred(res.isStarred);
      setStarsCount(res.starsCount);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleFork = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.username === repo.ownerUsername) {
      alert('You cannot fork your own repository.');
      return;
    }
    setForking(true);
    try {
      const res = await api.forkRepo(repo.ownerUsername, repo.name);
      navigate(`/${res.repository.ownerUsername}/${res.repository.name}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setForking(false);
    }
  };

  const tabs = [
    { id: 'code', label: 'Code', icon: Code, badge: null, path: `/${repo.ownerUsername}/${repo.name}` },
    { id: 'issues', label: 'Issues', icon: CircleDot, badge: counts?.issues, path: `/${repo.ownerUsername}/${repo.name}/issues` },
    { id: 'pulls', label: 'Pull requests', icon: GitPullRequest, badge: counts?.pullRequests, path: `/${repo.ownerUsername}/${repo.name}/pulls` },
    { id: 'commits', label: 'Commits', icon: GitCommit, badge: counts?.commits, path: `/${repo.ownerUsername}/${repo.name}/commits` },
    { id: 'runner', label: 'Live Runner', icon: Play, isRunner: true, path: `/${repo.ownerUsername}/${repo.name}/runner` },
    ...(isOwner ? [{ id: 'settings', label: 'Settings', icon: Settings, badge: null, path: `/${repo.ownerUsername}/${repo.name}/settings` }] : [])
  ];

  return (
    <div className="bg-gh-surface border-b border-gh-border pt-4 px-4 sm:px-6">
      <div className="max-w-[1400px] mx-auto">
        {/* Repo Title & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
          {/* Breadcrumb Title */}
          <div className="flex items-center flex-wrap gap-2 text-lg sm:text-xl font-normal">
            <Link to={`/${repo.ownerUsername}`} className="text-gh-link hover:underline">
              {repo.ownerUsername}
            </Link>
            <span className="text-gh-muted">/</span>
            <Link to={`/${repo.ownerUsername}/${repo.name}`} className="text-gh-link font-semibold hover:underline">
              {repo.name}
            </Link>
            <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border border-gh-border text-gh-muted">
              {repo.visibility === 'private' ? (
                <>
                  <Lock className="w-3 h-3 text-gh-gold" /> Private
                </>
              ) : (
                <>
                  <Globe className="w-3 h-3 text-gh-muted" /> Public
                </>
              )}
            </span>
            {repo.forkedFrom && (
              <div className="w-full text-xs text-gh-muted mt-0.5">
                forked from <Link to={`/${repo.forkedFrom.ownerUsername}/${repo.forkedFrom.repoName}`} className="text-gh-link hover:underline">{repo.forkedFrom.ownerUsername}/{repo.forkedFrom.repoName}</Link>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Star Button */}
            <button
              onClick={handleStar}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
                isStarred
                  ? 'bg-gh-subtle border-gh-border text-gh-gold hover:border-gh-muted'
                  : 'bg-gh-surface hover:bg-gh-subtle border-gh-border text-gh-text hover:border-gh-muted'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-gh-gold text-gh-gold' : ''}`} />
              <span>{isStarred ? 'Starred' : 'Star'}</span>
              <span className="ml-1 px-1.5 py-0.2 bg-gh-subtle border border-gh-border rounded-full text-[11px] text-gh-muted">
                {starsCount}
              </span>
            </button>

            {/* Fork Button */}
            <button
              onClick={handleFork}
              disabled={forking || (user && user.username === repo.ownerUsername)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gh-surface hover:bg-gh-subtle disabled:opacity-50 border border-gh-border hover:border-gh-muted rounded-md text-xs font-semibold text-gh-text transition-colors"
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>{forking ? 'Forking...' : 'Fork'}</span>
              <span className="ml-1 px-1.5 py-0.2 bg-gh-subtle border border-gh-border rounded-full text-[11px] text-gh-muted">
                {repo.forksCount || 0}
              </span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar -mb-px">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <Link
                key={tab.id}
                to={tab.path}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-[#f78166] text-gh-text font-semibold'
                    : 'border-transparent text-gh-muted hover:text-gh-text hover:border-gh-border'
                }`}
              >
                <Icon className={`w-4 h-4 ${tab.isRunner ? 'text-gh-gold animate-pulse' : ''}`} />
                <span>{tab.label}</span>
                {tab.badge !== null && tab.badge !== undefined && (
                  <span className="px-1.5 py-0.2 text-[11px] bg-gh-subtle border border-gh-border rounded-full text-gh-muted">
                    {tab.badge}
                  </span>
                )}
                {tab.isRunner && (
                  <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded uppercase tracking-wider">
                    Live
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
