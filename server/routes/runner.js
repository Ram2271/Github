const express = require('express');
const http = require('http');
const Repository = require('../models/Repository');
const runnerService = require('../services/runnerService');
const { optionalAuth, requireAuth } = require('../middleware/auth');

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

// GET /api/runner/detect/:owner/:repo/* - Detect runner capabilities
router.get('/detect/:owner/:repo/*', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const branch = req.params[0] || repo.defaultBranch || 'main';
    const detection = await runnerService.detectProject(String(repo._id), branch);
    res.json({
      detection,
      runnerUrl: `/runner/${repo.ownerUsername}/${repo.name}/${branch}/`
    });
  } catch (err) {
    res.status(500).json({ error: 'Detection failed: ' + err.message });
  }
});

// POST /api/runner/python/:owner/:repo/:branch/start - Start python server
router.post('/python/:owner/:repo/:branch/start', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const result = await runnerService.startPythonServer(String(repo._id), req.params.branch);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/runner/python/:owner/:repo/:branch/stop - Stop python server
router.post('/python/:owner/:repo/:branch/stop', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const result = runnerService.stopPythonServer(String(repo._id), req.params.branch);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/runner/python/:owner/:repo/:branch/status - Get status & logs
router.get('/python/:owner/:repo/:branch/status', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const status = runnerService.getPythonServerStatus(String(repo._id), req.params.branch);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = {
  apiRouter: router,
  /**
   * Express middleware to serve static web project files over /runner/:owner/:repo/:branch/*
   */
  serveWebProject: async (req, res) => {
    try {
      const { owner, repo: repoName, branch } = req.params;
      let subpath = req.path.replace(/^\/+/, '');
      if (!subpath || subpath.endsWith('/')) {
        subpath += 'index.html';
      }
      console.log('[RunnerServe]', { owner, repoName, branch, subpath, path: req.path });

      const repo = await Repository.findOne({
        ownerUsername: owner.toLowerCase(),
        name: repoName.toLowerCase()
      });

      if (!repo) {
        return res.status(404).send('Repository not found');
      }

      // Check Python proxy if python server running
      const pyStatus = runnerService.getPythonServerStatus(String(repo._id), branch);
      if (pyStatus.status === 'running' && pyStatus.port && !subpath.includes('.html')) {
        // Proxy to python port
        const proxyReq = http.request({
          hostname: '127.0.0.1',
          port: pyStatus.port,
          path: '/' + subpath,
          method: req.method,
          headers: req.headers
        }, (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        });
        proxyReq.on('error', () => {
          res.status(502).send('Error connecting to Python runner server.');
        });
        req.pipe(proxyReq, { end: true });
        return;
      }

      // Serve web project asset
      const asset = await runnerService.getWebProjectAsset(String(repo._id), branch, subpath);

      if (!asset.found) {
        return res.status(404).send(`Asset not found: ${subpath || 'index.html'}`);
      }

      res.setHeader('Content-Type', asset.contentType);
      res.send(asset.buffer);
    } catch (err) {
      console.error('Runner serve error:', err);
      res.status(500).send('Runner Error: ' + err.message);
    }
  }
};
