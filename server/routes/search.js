const express = require('express');
const Repository = require('../models/Repository');
const User = require('../models/User');
const FileNode = require('../models/FileNode');
const Issue = require('../models/Issue');
const PullRequest = require('../models/PullRequest');
const { optionalAuth } = require('../middleware/auth');
const storageService = require('../services/storageService');

const router = express.Router();

// GET /api/search?q=...&type=repositories|users|code|issues|pulls
router.get('/', optionalAuth, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const type = req.query.type || 'repositories';
    if (!q) {
      return res.json({
        type,
        query: '',
        results: [],
        counts: { repositories: 0, users: 0, code: 0, issues: 0, pullRequests: 0 }
      });
    }

    const regex = new RegExp(q, 'i');

    // 1. Repositories search (public only, or owned by user)
    const repoMatch = {
      $and: [
        {
          $or: [
            { name: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } },
            { language: { $regex: q, $options: 'i' } }
          ]
        },
        {
          $or: [
            { visibility: 'public' },
            ...(req.user ? [{ ownerUsername: req.user.username }] : [])
          ]
        }
      ]
    };
    const repos = await Repository.find(repoMatch);

    // 2. Users search
    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { bio: { $regex: q, $options: 'i' } }
      ]
    });
    const safeUsers = users.map(u => {
      const { password, ...rest } = u;
      return rest;
    });

    // 3. Issues search
    const issues = await Issue.find({
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { body: { $regex: q, $options: 'i' } }
      ]
    });

    // 4. Pull Requests search
    const pullRequests = await PullRequest.find({
      $or: [
        { title: { $regex: q, $options: 'i' } },
        { body: { $regex: q, $options: 'i' } }
      ]
    });

    // 5. Code / Files search (match by path/name or content)
    const fileMatches = await FileNode.find({
      $or: [
        { name: { $regex: q, $options: 'i' } },
        { path: { $regex: q, $options: 'i' } }
      ]
    });

    const codeResults = [];
    for (const f of fileMatches.slice(0, 30)) {
      const parentRepo = await Repository.findById(f.repoId);
      if (parentRepo && (parentRepo.visibility === 'public' || (req.user && req.user.username === parentRepo.ownerUsername))) {
        codeResults.push({
          ...f,
          repoName: parentRepo.name,
          ownerUsername: parentRepo.ownerUsername
        });
      }
    }

    const counts = {
      repositories: repos.length,
      users: safeUsers.length,
      code: codeResults.length,
      issues: issues.length,
      pullRequests: pullRequests.length
    };

    let results = [];
    switch (type) {
      case 'users':
        results = safeUsers;
        break;
      case 'code':
        results = codeResults;
        break;
      case 'issues':
        results = issues;
        break;
      case 'pulls':
      case 'pullRequests':
        results = pullRequests;
        break;
      case 'repositories':
      default:
        results = repos;
        break;
    }

    res.json({
      query: q,
      type,
      results,
      counts
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Failed to perform search' });
  }
});

module.exports = router;
