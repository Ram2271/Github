import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import RepoHeader from '../components/repo/RepoHeader';
import FileBrowser from '../components/repo/FileBrowser';
import FileViewer from '../components/repo/FileViewer';
import CodeEditor from '../components/repo/CodeEditor';
import FolderUploader from '../components/repo/FolderUploader';
import CommitList from '../components/repo/CommitList';
import IssueList from '../components/issues/IssueList';
import IssueDetail from '../components/issues/IssueDetail';
import PullRequestList from '../components/pr/PullRequestList';
import NewPullRequest from '../components/pr/NewPullRequest';
import PullRequestDetail from '../components/pr/PullRequestDetail';
import LiveRunner from '../components/runner/LiveRunner';
import RepoSettings from '../components/repo/RepoSettings';

export default function RepoView() {
  const { owner, repo: repoName } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [repoData, setRepoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [treeData, setTreeData] = useState(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Parse path for views: blob, tree, new, edit, issues, pulls, commits, runner, settings
  const pathname = location.pathname;
  const basePath = `/${owner}/${repoName}`;
  const subroute = pathname.startsWith(basePath) ? pathname.substring(basePath.length) : '';

  // Determine active view & tab
  let activeTab = 'code';
  let viewMode = 'tree'; // 'tree' | 'blob' | 'new' | 'edit' | 'issue_detail' | 'pr_detail' | 'pr_new'
  let targetPath = '';

  if (subroute.startsWith('/issues')) {
    activeTab = 'issues';
    const issueNum = subroute.replace('/issues/', '');
    if (issueNum && issueNum !== '/issues') viewMode = 'issue_detail';
  } else if (subroute.startsWith('/pulls/new')) {
    activeTab = 'pulls';
    viewMode = 'pr_new';
  } else if (subroute.startsWith('/pulls')) {
    activeTab = 'pulls';
  } else if (subroute.startsWith('/pull/')) {
    activeTab = 'pulls';
    viewMode = 'pr_detail';
  } else if (subroute.startsWith('/commits')) {
    activeTab = 'commits';
  } else if (subroute.startsWith('/runner')) {
    activeTab = 'runner';
  } else if (subroute.startsWith('/settings')) {
    activeTab = 'settings';
  } else if (subroute.startsWith('/blob/')) {
    activeTab = 'code';
    viewMode = 'blob';
    const parts = subroute.replace('/blob/', '').split('/');
    const b = parts[0];
    targetPath = parts.slice(1).join('/');
  } else if (subroute.startsWith('/tree/')) {
    activeTab = 'code';
    viewMode = 'tree';
    const parts = subroute.replace('/tree/', '').split('/');
    const b = parts[0];
    targetPath = parts.slice(1).join('/');
  } else if (subroute.startsWith('/new/')) {
    activeTab = 'code';
    viewMode = 'new';
    const parts = subroute.replace('/new/', '').split('/');
    targetPath = parts.slice(1).join('/');
  } else if (subroute.startsWith('/edit/')) {
    activeTab = 'code';
    viewMode = 'edit';
    const parts = subroute.replace('/edit/', '').split('/');
    targetPath = parts.slice(1).join('/');
  }

  // Load Repo Overview
  const loadRepo = async () => {
    try {
      const data = await api.getRepo(owner, repoName);
      setRepoData(data);
      if (!currentBranch) {
        setCurrentBranch(data.defaultBranch || 'main');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepo();
  }, [owner, repoName]);

  // Load Tree Data when on tree view
  const loadTree = async () => {
    if (!repoData) return;
    setTreeLoading(true);
    try {
      const data = await api.getTree(owner, repoName, currentBranch, targetPath);
      setTreeData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setTreeLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'code' && viewMode === 'tree') {
      loadTree();
    }
  }, [owner, repoName, currentBranch, targetPath, activeTab, viewMode, repoData]);

  if (loading) {
    return <div className="p-16 text-center text-gh-muted animate-pulse text-xs">Loading repository...</div>;
  }

  if (!repoData) {
    return <div className="p-16 text-center text-gh-muted text-xs">Repository not found or private.</div>;
  }

  const { repository: repo, branches, counts, isStarred, isOwner } = repoData;

  return (
    <div className="min-h-screen bg-gh-bg">
      {/* Top Repo Header & Tabs */}
      <RepoHeader
        repo={repo}
        counts={counts}
        activeTab={activeTab}
        isStarred={isStarred}
        isOwner={isOwner}
      />

      {/* Tab Content Container */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'code' && (
          <>
            {viewMode === 'tree' && (
              <FileBrowser
                repo={repo}
                branch={currentBranch}
                branches={branches}
                subpath={targetPath}
                treeData={treeData}
                onBranchChange={(newB) => {
                  setCurrentBranch(newB);
                  navigate(`/${repo.ownerUsername}/${repo.name}/tree/${newB}/${targetPath}`);
                }}
                onOpenUploadModal={() => setUploadModalOpen(true)}
                onRefresh={() => {
                  loadTree();
                  loadRepo();
                }}
                onBranchDeleted={async (deletedB) => {
                  await loadRepo();
                  if (currentBranch === deletedB) {
                    setCurrentBranch(repo.defaultBranch || 'main');
                    navigate(`/${repo.ownerUsername}/${repo.name}`);
                  }
                }}
                isOwner={isOwner}
              />
            )}

            {viewMode === 'blob' && (
              <FileViewer
                repo={repo}
                branch={currentBranch}
                filePath={targetPath}
                isOwner={isOwner}
              />
            )}

            {viewMode === 'new' && (
              <CodeEditor
                repo={repo}
                branch={currentBranch}
                initialPath={targetPath}
                isEdit={false}
              />
            )}

            {viewMode === 'edit' && (
              <CodeEditor
                repo={repo}
                branch={currentBranch}
                initialPath={targetPath}
                isEdit={true}
              />
            )}
          </>
        )}

        {activeTab === 'issues' && (
          <>
            {viewMode === 'issue_detail' ? (
              <IssueDetail repo={repo} />
            ) : (
              <IssueList repo={repo} isOwner={isOwner} />
            )}
          </>
        )}

        {activeTab === 'pulls' && (
          <>
            {viewMode === 'pr_new' ? (
              <NewPullRequest repo={repo} branches={branches} />
            ) : viewMode === 'pr_detail' ? (
              <PullRequestDetail repo={repo} />
            ) : (
              <PullRequestList repo={repo} isOwner={isOwner} />
            )}
          </>
        )}

        {activeTab === 'commits' && (
          <CommitList repo={repo} branch={currentBranch} />
        )}

        {activeTab === 'runner' && (
          <LiveRunner repo={repo} branch={currentBranch} />
        )}

        {activeTab === 'settings' && isOwner && (
          <RepoSettings
            repo={repo}
            onRepoUpdated={(updated) => setRepoData(prev => ({ ...prev, repository: updated }))}
          />
        )}
      </div>

      {/* Upload Folder / Files Modal */}
      {uploadModalOpen && (
        <FolderUploader
          repo={repo}
          branch={currentBranch}
          onClose={() => setUploadModalOpen(false)}
          onSuccess={() => {
            loadTree();
            loadRepo();
          }}
        />
      )}
    </div>
  );
}
