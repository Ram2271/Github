const express = require('express');
const Repository = require('../models/Repository');
const Branch = require('../models/Branch');
const FileNode = require('../models/FileNode');
const Commit = require('../models/Commit');
const Issue = require('../models/Issue');
const PullRequest = require('../models/PullRequest');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const gitService = require('../services/gitService');
const storageService = require('../services/storageService');

const router = express.Router();

// Helper to resolve repo by owner username and repo name
async function findRepo(ownerUsername, repoName, user) {
  const repo = await Repository.findOne({
    ownerUsername: ownerUsername.toLowerCase(),
    name: repoName.toLowerCase()
  });
  if (!repo) return null;

  if (repo.visibility === 'private') {
    if (!user || user.username !== repo.ownerUsername) {
      return null;
    }
  }
  return repo;
}

// GET /api/repos - Explore / feed public repos
router.get('/', optionalAuth, async (req, res) => {
  try {
    const repos = await Repository.find({ visibility: 'public' });
    const repoList = Array.isArray(repos) ? repos : [];
    repoList.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    res.json({ repositories: repoList.slice(0, 30) });
  } catch (err) {
    console.error('Fetch repos error:', err);
    res.status(500).json({ error: 'Failed to fetch repositories: ' + err.message });
  }
});

// POST /api/repos - Create repository
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, description = '', visibility = 'public', initReadme = true, language = 'JavaScript' } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Repository name is required.' });
    }

    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9-_.]/g, '-');
    const existing = await Repository.findOne({
      ownerUsername: req.user.username,
      name: cleanName
    });
    if (existing) {
      return res.status(400).json({ error: `You already have a repository named "${cleanName}".` });
    }

    const repo = await Repository.create({
      name: cleanName,
      description: description.trim(),
      owner: String(req.user._id),
      ownerUsername: req.user.username,
      visibility: visibility === 'private' ? 'private' : 'public',
      defaultBranch: 'main',
      starsCount: 0,
      forksCount: 0,
      forkedFrom: null,
      isWebProject: false,
      isPythonProject: false,
      runnerEntryPoint: null,
      topics: [],
      language: language || 'JavaScript',
      license: 'MIT'
    });

    // Create default 'main' branch
    await Branch.create({
      repoId: String(repo._id),
      name: 'main',
      commitSha: null,
      isDefault: true
    });

    // If initReadme requested, create initial README.md and commit
    if (initReadme) {
      const readmeContent = `# ${repo.name}\n\n${repo.description || 'A new repository created on GitHub.'}\n\n## Getting Started\n\nWelcome to your new repository! You can add files, upload complete folders, write code, create branches, and preview your live web application using the built-in Runner.\n`;
      const readmePath = 'README.md';

      // 1. Upload to Cloud Storage
      const uploadRef = await storageService.uploadFile(
        String(repo._id),
        'main',
        readmePath,
        readmeContent,
        'text/markdown'
      );

      // 2. Initial commit
      const commit = await gitService.recordCommit({
        repoId: String(repo._id),
        branchName: 'main',
        message: 'Initial commit',
        author: req.user,
        filesChanged: [{
          path: readmePath,
          status: 'added',
          additions: readmeContent.split('\n').length,
          deletions: 0
        }]
      });

      // 3. Store file node metadata & Filebase object reference in MongoDB
      await FileNode.create({
        repoId: String(repo._id),
        branch: 'main',
        path: readmePath,
        name: readmePath,
        type: 'file',
        size: Buffer.byteLength(readmeContent),
        mimeType: 'text/markdown',
        storage: uploadRef,
        lastCommitSha: commit.sha,
        lastCommitMessage: commit.message,
        lastCommitAuthor: req.user.username,
        lastCommitDate: new Date()
      });
    }

    // Record activity
    const dateStr = new Date().toISOString().split('T')[0];
    await Activity.create({
      userId: String(req.user._id),
      username: req.user.username,
      type: 'create_repo',
      repoId: String(repo._id),
      repoName: repo.name,
      details: `Created repository ${req.user.username}/${repo.name}`,
      count: 1,
      date: dateStr
    });

    res.status(201).json({ repository: repo });
  } catch (err) {
    console.error('Create repo error:', err);
    res.status(500).json({ error: 'Failed to create repository.' });
  }
});

// GET /api/repos/:owner/:repo - Repository details
router.get('/:owner/:repo', optionalAuth, async (req, res) => {
  try {
    const repo = await findRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) {
      return res.status(404).json({ error: 'Repository not found or private.' });
    }

    // Fetch branches
    const branches = await Branch.find({ repoId: String(repo._id) });
    const commitsCount = await Commit.countDocuments({ repoId: String(repo._id) });
    const issuesCount = await Issue.countDocuments({ repoId: String(repo._id), state: 'open' });
    const pullsCount = await PullRequest.countDocuments({ repoId: String(repo._id), state: 'open' });

    // Has current user starred?
    let isStarred = false;
    if (req.user) {
      isStarred = (req.user.starredRepos || []).includes(String(repo._id));
    }

    res.json({
      repository: repo,
      branches: branches.map(b => b.name),
      defaultBranch: repo.defaultBranch || 'main',
      counts: {
        commits: commitsCount,
        branches: branches.length,
        issues: issuesCount,
        pullRequests: pullsCount,
        stars: repo.starsCount || 0,
        forks: repo.forksCount || 0
      },
      isStarred,
      isOwner: req.user && req.user.username === repo.ownerUsername
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch repository' });
  }
});

// PUT /api/repos/:owner/:repo - Update repository settings
router.put('/:owner/:repo', requireAuth, async (req, res) => {
  try {
    const repo = await findRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    if (repo.ownerUsername !== req.user.username) {
      return res.status(403).json({ error: 'Permission denied. Only the repository owner can modify settings.' });
    }

    const { name, description, visibility, defaultBranch } = req.body;
    const update = {};
    if (name) update.name = name.trim().toLowerCase().replace(/[^a-z0-9-_.]/g, '-');
    if (description !== undefined) update.description = description.trim();
    if (visibility && ['public', 'private'].includes(visibility)) update.visibility = visibility;
    if (defaultBranch) update.defaultBranch = defaultBranch;

    const updated = await Repository.findByIdAndUpdate(repo._id, { $set: update }, { new: true });
    res.json({ repository: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update repository settings' });
  }
});

// DELETE /api/repos/:owner/:repo - Delete repository
router.delete('/:owner/:repo', requireAuth, async (req, res) => {
  try {
    const repo = await findRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    if (repo.ownerUsername !== req.user.username) {
      return res.status(403).json({ error: 'Only the repository owner can delete this repository.' });
    }

    // Delete associated resources
    await Branch.deleteMany({ repoId: String(repo._id) });
    await Commit.deleteMany({ repoId: String(repo._id) });
    await FileNode.deleteMany({ repoId: String(repo._id) });
    await Issue.deleteMany({ repoId: String(repo._id) });
    await PullRequest.deleteMany({ repoId: String(repo._id) });
    await Repository.findByIdAndDelete(repo._id);

    res.json({ message: `Repository ${repo.name} successfully deleted.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete repository' });
  }
});

// POST /api/repos/:owner/:repo/star - Toggle star
router.post('/:owner/:repo/star', requireAuth, async (req, res) => {
  try {
    const repo = await findRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const userStarred = (req.user.starredRepos || []).includes(String(repo._id));

    if (userStarred) {
      // Unstar
      await User.updateOne({ _id: req.user._id }, { $pull: { starredRepos: String(repo._id) } });
      await Repository.updateOne({ _id: repo._id }, { $inc: { starsCount: -1 } });
    } else {
      // Star
      await User.updateOne({ _id: req.user._id }, { $push: { starredRepos: String(repo._id) } });
      await Repository.updateOne({ _id: repo._id }, { $inc: { starsCount: 1 } });

      // Notify owner
      if (repo.ownerUsername !== req.user.username) {
        await Notification.create({
          recipientId: String(repo.owner),
          type: 'star',
          title: 'New Star',
          message: `${req.user.username} starred your repository ${repo.ownerUsername}/${repo.name}`,
          link: `/${repo.ownerUsername}/${repo.name}`,
          sender: { username: req.user.username, avatarUrl: req.user.avatarUrl },
          repoName: repo.name,
          read: false
        });
      }
    }

    const updatedRepo = await Repository.findById(repo._id);
    res.json({
      isStarred: !userStarred,
      starsCount: updatedRepo.starsCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle star' });
  }
});

// POST /api/repos/:owner/:repo/fork - Fork repository
router.post('/:owner/:repo/fork', requireAuth, async (req, res) => {
  try {
    const originalRepo = await findRepo(req.params.owner, req.params.repo, req.user);
    if (!originalRepo) return res.status(404).json({ error: 'Repository not found' });

    if (originalRepo.ownerUsername === req.user.username) {
      return res.status(400).json({ error: 'You cannot fork your own repository.' });
    }

    // Check if user already has a fork of this repo
    const existing = await Repository.findOne({
      ownerUsername: req.user.username,
      name: originalRepo.name
    });
    if (existing) {
      return res.status(400).json({ error: `You already have a repository named "${originalRepo.name}".` });
    }

    // Create cloned repository
    const fork = await Repository.create({
      name: originalRepo.name,
      description: originalRepo.description,
      owner: String(req.user._id),
      ownerUsername: req.user.username,
      visibility: 'public',
      defaultBranch: originalRepo.defaultBranch || 'main',
      starsCount: 0,
      forksCount: 0,
      forkedFrom: {
        repoId: String(originalRepo._id),
        ownerUsername: originalRepo.ownerUsername,
        repoName: originalRepo.name
      },
      isWebProject: originalRepo.isWebProject,
      isPythonProject: originalRepo.isPythonProject,
      runnerEntryPoint: originalRepo.runnerEntryPoint,
      topics: originalRepo.topics || [],
      language: originalRepo.language,
      license: originalRepo.license
    });

    // Clone branches
    const origBranches = await Branch.find({ repoId: String(originalRepo._id) });
    for (const b of origBranches) {
      await Branch.create({
        repoId: String(fork._id),
        name: b.name,
        commitSha: b.commitSha,
        isDefault: b.isDefault
      });
    }

    // Clone FileNode references pointing to same Filebase S3 objects
    const origFiles = await FileNode.find({ repoId: String(originalRepo._id) });
    for (const f of origFiles) {
      const { _id, ...rest } = f;
      await FileNode.create({
        ...rest,
        repoId: String(fork._id)
      });
    }

    // Clone commits
    const origCommits = await Commit.find({ repoId: String(originalRepo._id) });
    for (const c of origCommits) {
      const { _id, ...rest } = c;
      await Commit.create({
        ...rest,
        repoId: String(fork._id)
      });
    }

    // Increment fork count on original
    await Repository.updateOne({ _id: originalRepo._id }, { $inc: { forksCount: 1 } });

    // Notify owner
    await Notification.create({
      recipientId: String(originalRepo.owner),
      type: 'fork',
      title: 'New Fork',
      message: `${req.user.username} forked your repository ${originalRepo.ownerUsername}/${originalRepo.name}`,
      link: `/${req.user.username}/${fork.name}`,
      sender: { username: req.user.username, avatarUrl: req.user.avatarUrl },
      repoName: originalRepo.name,
      read: false
    });

    res.status(201).json({ repository: fork });
  } catch (err) {
    console.error('Fork error:', err);
    res.status(500).json({ error: 'Failed to fork repository.' });
  }
});

module.exports = router;
