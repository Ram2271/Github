const express = require('express');
const Repository = require('../models/Repository');
const Commit = require('../models/Commit');
const { optionalAuth } = require('../middleware/auth');

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

// GET /api/repos/:owner/:repo/commits/:branch - List commits
router.get('/:owner/:repo/commits/:branch', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const branchName = req.params.branch;
    const commits = await Commit.find({ repoId: String(repo._id), branch: branchName }).sort({ createdAt: -1 });

    res.json({
      branch: branchName,
      commits,
      totalCommits: commits.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch commits' });
  }
});

// GET /api/repos/:owner/:repo/commits/detail/:sha - Commit details with diffs
router.get('/:owner/:repo/commits/detail/:sha', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const sha = req.params.sha;
    const commit = await Commit.findOne({
      repoId: String(repo._id),
      $or: [{ sha }, { shortSha: sha }]
    });

    if (!commit) return res.status(404).json({ error: 'Commit not found' });

    res.json({ commit });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch commit details' });
  }
});

module.exports = router;
