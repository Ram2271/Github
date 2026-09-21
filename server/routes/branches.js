const express = require('express');
const Repository = require('../models/Repository');
const Branch = require('../models/Branch');
const FileNode = require('../models/FileNode');
const Commit = require('../models/Commit');
const { requireAuth, optionalAuth } = require('../middleware/auth');
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

// GET /api/repos/:owner/:repo/branches
router.get('/:owner/:repo/branches', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const branches = await Branch.find({ repoId: String(repo._id) });
    res.json({ branches });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// POST /api/repos/:owner/:repo/branches - Create branch
router.post('/:owner/:repo/branches', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    if (repo.ownerUsername !== req.user.username) {
      return res.status(403).json({ error: 'Only repository owner can create branches.' });
    }

    const { name, sourceBranch = 'main' } = req.body;
    if (!name) return res.status(400).json({ error: 'Branch name is required.' });

    const cleanName = name.trim().replace(/[^a-zA-Z0-9/_-]/g, '-');
    const existing = await Branch.findOne({ repoId: String(repo._id), name: cleanName });
    if (existing) {
      return res.status(400).json({ error: `Branch "${cleanName}" already exists.` });
    }

    const sourceBranchDoc = await Branch.findOne({ repoId: String(repo._id), name: sourceBranch });
    const tipCommitSha = sourceBranchDoc ? sourceBranchDoc.commitSha : null;

    // Create branch
    const branch = await Branch.create({
      repoId: String(repo._id),
      name: cleanName,
      commitSha: tipCommitSha,
      isDefault: false
    });

    // Duplicate FileNodes to new branch
    const sourceFiles = await FileNode.find({ repoId: String(repo._id), branch: sourceBranch });
    for (const file of sourceFiles) {
      const { _id, ...rest } = file;
      // Copy in Filebase S3
      try {
        const uploadRef = await filebaseService.duplicateFileToBranch(
          String(repo._id),
          sourceBranch,
          cleanName,
          file.path,
          file
        );
        await FileNode.create({
          ...rest,
          branch: cleanName,
          storage: uploadRef
        });
      } catch (err) {
        // Fallback reference
        await FileNode.create({
          ...rest,
          branch: cleanName
        });
      }
    }

    res.status(201).json({ branch });
  } catch (err) {
    console.error('Create branch error:', err);
    res.status(500).json({ error: 'Failed to create branch.' });
  }
});

// DELETE /api/repos/:owner/:repo/branches/:branchName
router.delete('/:owner/:repo/branches/:branchName', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    if (repo.ownerUsername !== req.user.username) {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const branchName = req.params.branchName;
    if (branchName === repo.defaultBranch) {
      return res.status(400).json({ error: 'Cannot delete the default branch.' });
    }

    await Branch.deleteOne({ repoId: String(repo._id), name: branchName });
    await FileNode.deleteMany({ repoId: String(repo._id), branch: branchName });

    res.json({ message: `Branch ${branchName} deleted.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete branch' });
  }
});

module.exports = router;
