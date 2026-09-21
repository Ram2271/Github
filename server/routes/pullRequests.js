const express = require('express');
const crypto = require('crypto');
const Repository = require('../models/Repository');
const PullRequest = require('../models/PullRequest');
const Branch = require('../models/Branch');
const FileNode = require('../models/FileNode');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const gitService = require('../services/gitService');
const filebaseService = require('../services/filebaseService');

const router = express.Router();

async function getRepo(ownerUsername, repoName, user) {
  const repo = await Repository.findOne({
    ownerUsername: ownerUsername.toLowerCase(),
    name: repoName.toLowerCase()
  });
  if (!repo) return null;
  if (repo.visibility === 'private' && (!user || user.username !== repo.ownerUsername)) return null;
  return repo;
}

// GET /api/repos/:owner/:repo/pulls - List PRs
router.get('/:owner/:repo/pulls', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const state = req.query.state || 'open';
    const query = { repoId: String(repo._id) };
    if (state !== 'all') {
      query.state = state;
    }

    const prs = await PullRequest.find(query).sort({ createdAt: -1 });

    const openCount = await PullRequest.countDocuments({ repoId: String(repo._id), state: 'open' });
    const closedCount = await PullRequest.countDocuments({ repoId: String(repo._id), state: { $in: ['closed', 'merged'] } });

    res.json({
      pullRequests: prs,
      counts: { open: openCount, closed: closedCount }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pull requests' });
  }
});

// POST /api/repos/:owner/:repo/pulls - Create PR
router.post('/:owner/:repo/pulls', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const { baseBranch = 'main', headBranch, title, body = '' } = req.body;
    if (!headBranch || !title) {
      return res.status(400).json({ error: 'Compare branch and PR title are required.' });
    }

    if (baseBranch === headBranch) {
      return res.status(400).json({ error: 'Base and compare branches must be different.' });
    }

    // Compute diff summary between branches
    const diffData = await gitService.getDiffBetweenBranches(String(repo._id), baseBranch, headBranch);

    const count = await PullRequest.countDocuments({ repoId: String(repo._id) });
    const number = count + 1;

    const pr = await PullRequest.create({
      repoId: String(repo._id),
      number,
      title: title.trim(),
      body: body.trim(),
      author: {
        userId: String(req.user._id),
        username: req.user.username,
        avatarUrl: req.user.avatarUrl
      },
      baseBranch,
      headBranch,
      state: 'open',
      mergedBy: null,
      mergedAt: null,
      mergeCommitSha: null,
      comments: [],
      diffSummary: {
        filesChanged: diffData.filesChanged.length,
        additions: diffData.totalAdditions,
        deletions: diffData.totalDeletions
      }
    });

    // Notify repo owner if PR opened by someone else
    if (repo.ownerUsername !== req.user.username) {
      await Notification.create({
        recipientId: String(repo.owner),
        type: 'pr',
        title: 'New Pull Request',
        message: `${req.user.username} opened pull request #${number}: ${pr.title}`,
        link: `/${repo.ownerUsername}/${repo.name}/pull/${number}`,
        sender: { username: req.user.username, avatarUrl: req.user.avatarUrl },
        repoName: repo.name,
        read: false
      });
    }

    // Activity
    const dateStr = new Date().toISOString().split('T')[0];
    await Activity.create({
      userId: String(req.user._id),
      username: req.user.username,
      type: 'open_pr',
      repoId: String(repo._id),
      repoName: repo.name,
      details: `Opened pull request #${number} on ${repo.ownerUsername}/${repo.name}`,
      count: 1,
      date: dateStr
    });

    res.status(201).json({ pullRequest: pr });
  } catch (err) {
    console.error('Create PR error:', err);
    res.status(500).json({ error: 'Failed to create pull request.' });
  }
});

// GET /api/repos/:owner/:repo/pulls/:number - PR details and diff
router.get('/:owner/:repo/pulls/:number', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const number = parseInt(req.params.number, 10);
    const pr = await PullRequest.findOne({ repoId: String(repo._id), number });
    if (!pr) return res.status(404).json({ error: 'Pull request not found' });

    // Compute live branch diff
    const diffData = await gitService.getDiffBetweenBranches(String(repo._id), pr.baseBranch, pr.headBranch);

    res.json({
      pullRequest: pr,
      diff: diffData,
      canMerge: pr.state === 'open' && (repo.ownerUsername === (req.user && req.user.username))
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch pull request' });
  }
});

// POST /api/repos/:owner/:repo/pulls/:number/comments - Add PR comment
router.post('/:owner/:repo/pulls/:number/comments', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const number = parseInt(req.params.number, 10);
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body cannot be empty.' });

    const pr = await PullRequest.findOne({ repoId: String(repo._id), number });
    if (!pr) return res.status(404).json({ error: 'Pull request not found' });

    const comment = {
      id: crypto.randomBytes(8).toString('hex'),
      author: {
        userId: String(req.user._id),
        username: req.user.username,
        avatarUrl: req.user.avatarUrl
      },
      body: body.trim(),
      createdAt: new Date()
    };

    await PullRequest.updateOne({ _id: pr._id }, { $push: { comments: comment } });

    res.status(201).json({ comment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// POST /api/repos/:owner/:repo/pulls/:number/merge - Merge pull request
router.post('/:owner/:repo/pulls/:number/merge', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    if (repo.ownerUsername !== req.user.username) {
      return res.status(403).json({ error: 'Only repository owner can merge pull requests.' });
    }

    const number = parseInt(req.params.number, 10);
    const pr = await PullRequest.findOne({ repoId: String(repo._id), number });
    if (!pr) return res.status(404).json({ error: 'Pull request not found' });
    if (pr.state !== 'open') return res.status(400).json({ error: 'Pull request is not open.' });

    // 1. Calculate diff
    const diffData = await gitService.getDiffBetweenBranches(String(repo._id), pr.baseBranch, pr.headBranch);

    // 2. Synchronize head files to base branch
    const headFiles = await FileNode.find({ repoId: String(repo._id), branch: pr.headBranch });

    for (const change of diffData.filesChanged) {
      if (change.status === 'deleted') {
        await FileNode.deleteOne({ repoId: String(repo._id), branch: pr.baseBranch, path: change.path });
        try {
          await filebaseService.deleteFile(String(repo._id), pr.baseBranch, change.path);
        } catch (_) {}
      } else {
        const headNode = headFiles.find(f => f.path === change.path);
        if (headNode) {
          // Copy object to base branch in Filebase S3
          const uploadRef = await filebaseService.duplicateFileToBranch(
            String(repo._id),
            pr.headBranch,
            pr.baseBranch,
            change.path,
            headNode
          );

          const existingBaseNode = await FileNode.findOne({
            repoId: String(repo._id),
            branch: pr.baseBranch,
            path: change.path
          });

          if (existingBaseNode) {
            await FileNode.updateOne(
              { _id: existingBaseNode._id },
              {
                $set: {
                  size: headNode.size,
                  storage: uploadRef,
                  lastCommitMessage: `Merge pull request #${pr.number} from ${pr.headBranch}`,
                  lastCommitAuthor: req.user.username,
                  lastCommitDate: new Date(),
                  updatedAt: new Date()
                }
              }
            );
          } else {
            const { _id, ...rest } = headNode;
            await FileNode.create({
              ...rest,
              branch: pr.baseBranch,
              storage: uploadRef,
              lastCommitMessage: `Merge pull request #${pr.number} from ${pr.headBranch}`,
              lastCommitAuthor: req.user.username,
              lastCommitDate: new Date()
            });
          }
        }
      }
    }

    // 3. Create merge commit on base branch
    const mergeCommit = await gitService.recordCommit({
      repoId: String(repo._id),
      branchName: pr.baseBranch,
      message: `Merge pull request #${pr.number} from ${pr.headBranch}`,
      description: pr.title,
      author: req.user,
      filesChanged: diffData.filesChanged
    });

    // 4. Mark PR as merged
    const now = new Date();
    await PullRequest.updateOne(
      { _id: pr._id },
      {
        $set: {
          state: 'merged',
          mergedBy: { userId: String(req.user._id), username: req.user.username },
          mergedAt: now,
          mergeCommitSha: mergeCommit.sha
        }
      }
    );

    // 5. Notify PR author
    if (pr.author.username !== req.user.username) {
      await Notification.create({
        recipientId: pr.author.userId,
        type: 'merge',
        title: 'Pull Request Merged',
        message: `Your pull request #${pr.number} was merged into ${pr.baseBranch}`,
        link: `/${repo.ownerUsername}/${repo.name}/pull/${pr.number}`,
        sender: { username: req.user.username, avatarUrl: req.user.avatarUrl },
        repoName: repo.name,
        read: false
      });
    }

    res.json({
      success: true,
      mergeCommitSha: mergeCommit.sha,
      message: `Pull request #${pr.number} merged successfully.`
    });
  } catch (err) {
    console.error('Merge PR error:', err);
    res.status(500).json({ error: 'Failed to merge pull request: ' + err.message });
  }
});

module.exports = router;
