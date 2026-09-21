const express = require('express');
const crypto = require('crypto');
const Repository = require('../models/Repository');
const Issue = require('../models/Issue');
const Notification = require('../models/Notification');
const Activity = require('../models/Activity');
const { requireAuth, optionalAuth } = require('../middleware/auth');

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

// GET /api/repos/:owner/:repo/issues
router.get('/:owner/:repo/issues', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const state = req.query.state || 'open';
    const query = { repoId: String(repo._id) };
    if (state !== 'all') {
      query.state = state;
    }

    const issues = await Issue.find(query).sort({ createdAt: -1 });

    const openCount = await Issue.countDocuments({ repoId: String(repo._id), state: 'open' });
    const closedCount = await Issue.countDocuments({ repoId: String(repo._id), state: 'closed' });

    res.json({
      issues,
      counts: { open: openCount, closed: closedCount }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// POST /api/repos/:owner/:repo/issues - Create issue
router.post('/:owner/:repo/issues', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const { title, body = '', labels = [] } = req.body;
    if (!title) return res.status(400).json({ error: 'Issue title is required.' });

    // Calculate next issue number for this repo
    const count = await Issue.countDocuments({ repoId: String(repo._id) });
    const number = count + 1;

    const issue = await Issue.create({
      repoId: String(repo._id),
      number,
      title: title.trim(),
      body: body.trim(),
      author: {
        userId: String(req.user._id),
        username: req.user.username,
        avatarUrl: req.user.avatarUrl
      },
      state: 'open',
      labels: Array.isArray(labels) ? labels : [],
      comments: [],
      closedAt: null
    });

    // Notify repo owner if issue opened by another user
    if (repo.ownerUsername !== req.user.username) {
      await Notification.create({
        recipientId: String(repo.owner),
        type: 'issue',
        title: 'New Issue Opened',
        message: `${req.user.username} opened issue #${number}: ${issue.title}`,
        link: `/${repo.ownerUsername}/${repo.name}/issues/${number}`,
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
      type: 'open_issue',
      repoId: String(repo._id),
      repoName: repo.name,
      details: `Opened issue #${number} on ${repo.ownerUsername}/${repo.name}`,
      count: 1,
      date: dateStr
    });

    res.status(201).json({ issue });
  } catch (err) {
    console.error('Create issue error:', err);
    res.status(500).json({ error: 'Failed to create issue.' });
  }
});

// GET /api/repos/:owner/:repo/issues/:number - Issue detail
router.get('/:owner/:repo/issues/:number', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const number = parseInt(req.params.number, 10);
    const issue = await Issue.findOne({ repoId: String(repo._id), number });
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    res.json({ issue });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issue' });
  }
});

// POST /api/repos/:owner/:repo/issues/:number/comments - Add comment
router.post('/:owner/:repo/issues/:number/comments', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const number = parseInt(req.params.number, 10);
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ error: 'Comment body cannot be empty.' });

    const issue = await Issue.findOne({ repoId: String(repo._id), number });
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

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

    const updated = await Issue.updateOne(
      { _id: issue._id },
      { $push: { comments: comment } }
    );

    // Notify issue author if someone else commented
    if (issue.author.username !== req.user.username) {
      await Notification.create({
        recipientId: issue.author.userId,
        type: 'comment',
        title: 'New Comment on Issue',
        message: `${req.user.username} commented on issue #${issue.number}`,
        link: `/${repo.ownerUsername}/${repo.name}/issues/${issue.number}`,
        sender: { username: req.user.username, avatarUrl: req.user.avatarUrl },
        repoName: repo.name,
        read: false
      });
    }

    res.status(201).json({ comment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// PATCH /api/repos/:owner/:repo/issues/:number/state - Toggle open/closed
router.patch('/:owner/:repo/issues/:number/state', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const number = parseInt(req.params.number, 10);
    const { state } = req.body;
    if (!['open', 'closed'].includes(state)) {
      return res.status(400).json({ error: 'State must be "open" or "closed".' });
    }

    const issue = await Issue.findOne({ repoId: String(repo._id), number });
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    const update = {
      state,
      closedAt: state === 'closed' ? new Date() : null
    };

    const updated = await Issue.updateOne({ _id: issue._id }, { $set: update });
    res.json({ issue: { ...issue, ...update } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change issue state' });
  }
});

module.exports = router;
