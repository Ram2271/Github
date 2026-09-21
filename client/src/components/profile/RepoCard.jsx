import React from 'react';
import { Link } from 'react-router-dom';
import { Star, GitFork, Play } from 'lucide-react';

export default function RepoCard({ repo }) {
  const languageColors = {
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    Python: '#3572A5',
    HTML: '#e34c26',
    CSS: '#563d7c',
    default: '#58a6ff'
  };

  const dotColor = languageColors[repo.language] || languageColors.default;

  return (
    <div className="border border-gh-border rounded-md bg-gh-surface p-4 flex flex-col justify-between hover:border-gh-muted transition-colors">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/${repo.ownerUsername}/${repo.name}`}
            className="text-gh-link font-semibold text-sm hover:underline truncate"
          >
            {repo.ownerUsername ? `${repo.ownerUsername} / ` : ''}{repo.name}
          </Link>
          <span className="px-2 py-0.2 text-[10px] font-medium border border-gh-border rounded-full text-gh-muted capitalize flex-shrink-0">
            {repo.visibility}
          </span>
        </div>

        {repo.description && (
          <p className="text-xs text-gh-muted line-clamp-2 leading-relaxed">
            {repo.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-gh-muted">
        {repo.language && (
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: dotColor }} />
            <span>{repo.language}</span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <Star className="w-3.5 h-3.5" />
          <span>{repo.starsCount || 0}</span>
        </div>

        <div className="flex items-center gap-1">
          <GitFork className="w-3.5 h-3.5" />
          <span>{repo.forksCount || 0}</span>
        </div>

        {(repo.isWebProject || repo.isPythonProject) && (
          <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded">
            <Play className="w-2.5 h-2.5 fill-amber-400" /> Runner
          </span>
        )}
      </div>
    </div>
  );
}
