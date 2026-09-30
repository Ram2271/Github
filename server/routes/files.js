const express = require('express');
const multer = require('multer');
const path = require('path');
const mime = require('mime-types');
const Repository = require('../models/Repository');
const Branch = require('../models/Branch');
const FileNode = require('../models/FileNode');
const Commit = require('../models/Commit');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const storageService = require('../services/storageService');
const gitService = require('../services/gitService');
const googleDriveStorage = require('../config/googleDrive');
const runnerService = require('../services/runnerService');
const { createZipBuffer } = require('../utils/zipBuilder');
const { buildSignedApk } = require('../services/apkBuilderService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB per file
});

// Helper to find repo with permission checks
async function getRepo(ownerUsername, repoName, user) {
  const repo = await Repository.findOne({
    ownerUsername: ownerUsername.toLowerCase(),
    name: repoName.toLowerCase()
  });
  if (!repo) return null;
  if (repo.visibility === 'private') {
    if (!user || user.username !== repo.ownerUsername) return null;
  }
  return repo;
}

// GET /api/files/:owner/:repo/tree/:branch and /api/files/:owner/:repo/tree/:branch/* - List directory items
router.get(['/:owner/:repo/tree/:branch', '/:owner/:repo/tree/:branch/*'], optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const branchName = req.params.branch;
    const requestedSubpath = (req.params[0] || '').replace(/^\/+/, '').replace(/\/+$/, '');

    // Get all files on this branch
    const allFiles = await FileNode.find({ repoId: String(repo._id), branch: branchName });

    // Filter items directly inside requestedSubpath
    const dirMap = new Map();
    const fileItems = [];

    for (const node of allFiles) {
      const nodePath = node.path;
      if (requestedSubpath) {
        if (!nodePath.startsWith(requestedSubpath + '/')) continue;
      }

      const relativeToCurrent = requestedSubpath
        ? nodePath.substring(requestedSubpath.length + 1)
        : nodePath;

      const segments = relativeToCurrent.split('/');
      if (segments.length === 1) {
        // Direct file child
        fileItems.push({
          name: segments[0],
          path: node.path,
          type: 'file',
          size: node.size,
          lastCommitSha: node.lastCommitSha,
          lastCommitMessage: node.lastCommitMessage,
          lastCommitAuthor: node.lastCommitAuthor,
          lastCommitDate: node.lastCommitDate
        });
      } else {
        // Belongs to a subdirectory
        const dirName = segments[0];
        const dirPath = requestedSubpath ? `${requestedSubpath}/${dirName}` : dirName;
        if (!dirMap.has(dirName)) {
          dirMap.set(dirName, {
            name: dirName,
            path: dirPath,
            type: 'directory',
            lastCommitSha: node.lastCommitSha,
            lastCommitMessage: node.lastCommitMessage,
            lastCommitAuthor: node.lastCommitAuthor,
            lastCommitDate: node.lastCommitDate
          });
        }
      }
    }

    const directories = Array.from(dirMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    const files = fileItems.sort((a, b) => a.name.localeCompare(b.name));
    const items = [...directories, ...files];

    // Find README.md in current directory if exists
    const readmeFile = allFiles.find(f => {
      const targetReadmePath = requestedSubpath ? `${requestedSubpath}/README.md` : 'README.md';
      return f.path.toLowerCase() === targetReadmePath.toLowerCase();
    });

    let readmeContent = null;
    if (readmeFile) {
      try {
        const fileObj = await storageService.getFile(String(repo._id), branchName, readmeFile.path, readmeFile.storage?.fileId);
        readmeContent = fileObj.buffer.toString('utf8');
      } catch (_) {}
    }

    // Get latest commit on this branch
    const latestCommit = await Commit.findOne({ repoId: String(repo._id), branch: branchName });

    // Detect index.html in current subpath or anywhere in repository on this branch
    const subpathIndex = allFiles.find(f => {
      const targetPath = requestedSubpath ? `${requestedSubpath}/index.html` : 'index.html';
      return f.path.toLowerCase() === targetPath.toLowerCase();
    });
    const anyIndex = subpathIndex || allFiles.find(f => f.path.toLowerCase() === 'index.html' || f.path.toLowerCase().endsWith('/index.html'));

    res.json({
      path: requestedSubpath,
      branch: branchName,
      items,
      readme: readmeContent ? { path: readmeFile.path, content: readmeContent } : null,
      latestCommit: latestCommit || null,
      hasIndexHtml: Boolean(anyIndex),
      indexHtmlPath: anyIndex ? anyIndex.path : null
    });
  } catch (err) {
    console.error('Tree error:', err);
    res.status(500).json({ error: 'Failed to read directory tree' });
  }
});

// GET /api/files/:owner/:repo/blob/:branch/* - View file content & metadata
router.get('/:owner/:repo/blob/:branch/*', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const branchName = req.params.branch;
    const filePath = (req.params[0] || '').replace(/^\/+/, '');

    const fileNode = await FileNode.findOne({
      repoId: String(repo._id),
      branch: branchName,
      path: filePath
    });

    if (!fileNode) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Retrieve file buffer directly from Google Drive using stored fileId
    const fileObj = await storageService.getFile(String(repo._id), branchName, filePath, fileNode.storage?.fileId);
    const isBinary = fileObj.contentType.startsWith('image/') ||
      fileObj.contentType.startsWith('audio/') ||
      fileObj.contentType.startsWith('video/') ||
      fileObj.contentType.includes('pdf') ||
      fileObj.contentType.includes('zip') ||
      fileObj.contentType.includes('octet-stream');

    const content = isBinary ? null : fileObj.buffer.toString('utf8');

    res.json({
      file: fileNode,
      content,
      isBinary,
      contentType: fileObj.contentType,
      size: fileObj.contentLength
    });
  } catch (err) {
    console.error('Blob error for path:', req.params[0], err.message);
    res.status(500).json({ error: 'Failed to retrieve file content: ' + (err.message || 'Error reading from storage') });
  }
});

// GET /api/files/:owner/:repo/raw/:branch/* - Raw file download/stream
router.get('/:owner/:repo/raw/:branch/*', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const branchName = req.params.branch;
    const filePath = (req.params[0] || '').replace(/^\/+/, '');

    const fileNode = await FileNode.findOne({
      repoId: String(repo._id),
      branch: branchName,
      path: filePath
    });

    const fileObj = await storageService.getFile(String(repo._id), branchName, filePath, fileNode?.storage?.fileId);
    res.setHeader('Content-Type', fileObj.contentType);
    res.setHeader('Content-Length', fileObj.contentLength);
    res.send(fileObj.buffer);
  } catch (err) {
    res.status(404).send('File not found: ' + err.message);
  }
});

// GET /api/files/:owner/:repo/download/:branch - Download all repository source code as a single .zip file
router.get('/:owner/:repo/download/:branch', optionalAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    const branchName = req.params.branch || repo.defaultBranch || 'main';
    const allFiles = await FileNode.find({ repoId: String(repo._id), branch: branchName });
    const rootFolder = `${repo.name}-${branchName}`;
    const zipEntries = [];

    if (!allFiles || allFiles.length === 0) {
      zipEntries.push({
        path: `${rootFolder}/README.md`,
        buffer: Buffer.from(`# ${repo.name}\n\n${repo.description || 'Repository source archive.'}\n`, 'utf8'),
        date: new Date()
      });
    } else {
      // Download file contents in parallel batches of 6
      const batchSize = 6;
      for (let i = 0; i < allFiles.length; i += batchSize) {
        const batch = allFiles.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (fileNode) => {
            try {
              const fileObj = await storageService.getFile(String(repo._id), branchName, fileNode.path, fileNode.storage?.fileId);
              return {
                path: `${rootFolder}/${fileNode.path.replace(/^\/+/, '')}`,
                buffer: fileObj.buffer,
                date: fileNode.lastCommitDate || fileNode.updatedAt || new Date()
              };
            } catch (e) {
              return null;
            }
          })
        );
        for (const item of results) {
          if (item) zipEntries.push(item);
        }
      }
    }

    const zipBuffer = createZipBuffer(zipEntries);
    const filename = `${repo.name}-${branchName}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', zipBuffer.length);
    res.send(zipBuffer);
  } catch (err) {
    console.error('Download ZIP error:', err);
    res.status(500).json({ error: 'Failed to generate source code ZIP archive' });
  }
});

// POST /api/files/:owner/:repo/build-apk - Convert repository index.html + web assets into a signed Android APK and auto-commit to repo
router.post('/:owner/:repo/build-apk', requireAuth, upload.single('icon'), async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });

    // Strict owner verification: only the creator of the repository can build APKs
    if (repo.ownerUsername !== req.user.username) {
      return res.status(403).json({ error: 'Permission denied. Only the repository creator can build APKs for this repository.' });
    }

    const branch = req.body.branch || repo.defaultBranch || 'main';
    const subpath = String(req.body.subpath || '').replace(/^\/+/, '').replace(/\/+$/, '');
    const defaultPkg = `com.${repo.ownerUsername.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'dev'}.${repo.name.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'app'}`;

    const appName = String(req.body.appName || repo.name).trim() || repo.name;
    const packageId = String(req.body.packageId || defaultPkg).trim().toLowerCase();
    const version = String(req.body.version || '1.0.0').trim() || '1.0.0';
    const orientation = String(req.body.orientation || 'sensor').trim().toLowerCase();
    const fullscreen = req.body.fullscreen !== 'false' && req.body.fullscreen !== false;

    // Fetch all files in the repository on this branch
    const allFiles = await FileNode.find({ repoId: String(repo._id), branch });
    if (!allFiles || allFiles.length === 0) {
      return res.status(400).json({ error: 'Repository is empty. Please add an index.html file first.' });
    }

    // Locate index.html (prefer current subpath if specified, else root index.html, else any nested index.html)
    let indexNode = null;
    if (subpath) {
      indexNode = allFiles.find(f => f.path.toLowerCase() === `${subpath}/index.html`.toLowerCase());
    }
    if (!indexNode) {
      indexNode = allFiles.find(f => f.path.toLowerCase() === 'index.html');
    }
    if (!indexNode) {
      indexNode = allFiles.find(f => f.path.toLowerCase().endsWith('/index.html'));
    }
    if (!indexNode) {
      return res.status(400).json({ error: 'No index.html found in this repository. An index.html file is required to build an Android APK.' });
    }

    // Determine base prefix to strip so index.html sits at root of assets/
    const basePrefix = indexNode.path.toLowerCase() === 'index.html'
      ? ''
      : indexNode.path.slice(0, indexNode.path.length - 'index.html'.length);

    const candidateNodes = allFiles.filter(f => {
      if (f.path.toLowerCase().endsWith('.apk')) return false;
      if (basePrefix) return f.path.startsWith(basePrefix);
      return true;
    });

    const webFiles = [];
    let detectedIconBuffer = req.file ? req.file.buffer : null;

    // Download web files in parallel batches of 6 using direct Google Drive fileId
    const batchSize = 6;
    for (let i = 0; i < candidateNodes.length; i += batchSize) {
      const batch = candidateNodes.slice(i, i + batchSize);
      const loaded = await Promise.all(
        batch.map(async (node) => {
          try {
            const fileObj = await storageService.getFile(String(repo._id), branch, node.path, node.storage?.fileId);
            const relAssetPath = basePrefix && node.path.startsWith(basePrefix)
              ? node.path.slice(basePrefix.length)
              : node.path;
            return { path: relAssetPath, buffer: fileObj.buffer };
          } catch (_) {
            return null;
          }
        })
      );
      for (const item of loaded) {
        if (!item) continue;
        webFiles.push(item);
        if (!detectedIconBuffer && /^(icon|logo|favicon|apple-touch-icon)\.png$/i.test(path.basename(item.path))) {
          detectedIconBuffer = item.buffer;
        }
      }
    }

    // Build and sign the Android APK in pure Node.js
    const apkBuffer = buildSignedApk({
      appName,
      packageId,
      version,
      orientation,
      fullscreen,
      startUrl: 'file:///android_asset/index.html',
      iconBuffer: detectedIconBuffer,
      webFiles
    });

    const safeRepoSlug = (req.body.apkFileName || repo.name).replace(/[^a-zA-Z0-9._-]/g, '-').replace(/\.apk$/i, '');
    const apkFileName = `${safeRepoSlug}.apk`;
    const isOwner = Boolean(req.user && req.user.username === repo.ownerUsername);
    let commit = null;

    // Automatically add and commit the generated APK into the repository if requested by owner (or if repo owner exists)
    const commitAuthor = req.user || {
      username: repo.ownerUsername,
      name: repo.ownerUsername,
      email: `${repo.ownerUsername}@users.noreply.github.com`
    };

    const apkMimeType = 'application/vnd.android.package-archive';
    const storageRef = await storageService.uploadFile(
      String(repo._id),
      branch,
      apkFileName,
      apkBuffer,
      apkMimeType
    );

    const timestamp = new Date();
    const commitMessage = `Build Android APK: ${apkFileName} (v${version})`;
    const existingApk = await FileNode.findOne({
      repoId: String(repo._id),
      branch,
      path: apkFileName
    });

    if (existingApk) {
      await FileNode.updateOne(
        { _id: existingApk._id },
        {
          $set: {
            size: apkBuffer.length,
            mimeType: apkMimeType,
            storage: storageRef,
            lastCommitMessage: commitMessage,
            lastCommitAuthor: commitAuthor.username,
            lastCommitDate: timestamp,
            updatedAt: timestamp
          }
        }
      );
    } else {
      await FileNode.create({
        repoId: String(repo._id),
        branch,
        path: apkFileName,
        name: apkFileName,
        type: 'file',
        size: apkBuffer.length,
        mimeType: apkMimeType,
        storage: storageRef,
        lastCommitMessage: commitMessage,
        lastCommitAuthor: commitAuthor.username,
        lastCommitDate: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }

    commit = await gitService.recordCommit({
      repoId: String(repo._id),
      branchName: branch,
      message: commitMessage,
      description: `Automatically built and signed Android APK (${packageId} v${version}) from ${indexNode.path}`,
      author: commitAuthor,
      filesChanged: [
        {
          path: apkFileName,
          status: existingApk ? 'modified' : 'added',
          additions: 1,
          deletions: 0
        }
      ]
    });

    await FileNode.updateOne(
      { repoId: String(repo._id), branch, path: apkFileName },
      { $set: { lastCommitSha: commit.sha } }
    );

    res.json({
      success: true,
      committedToRepo: true,
      apkFileName,
      apkSize: apkBuffer.length,
      appName,
      packageId,
      version,
      indexHtmlPath: indexNode.path,
      commit,
      downloadUrl: `/api/files/${repo.ownerUsername}/${repo.name}/raw/${branch}/${apkFileName}`,
      apkBase64: apkBuffer.toString('base64')
    });
  } catch (err) {
    console.error('Build APK error:', err);
    res.status(500).json({ error: err.message || 'Failed to build Android APK' });
  }
});

// POST /api/files/:owner/:repo/upload & /upload/:branch - Upload multiple files or complete folders
router.post(['/:owner/:repo/upload', '/:owner/:repo/upload/:branch'], requireAuth, upload.array('files'), async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    if (repo.ownerUsername !== req.user.username) {
      return res.status(403).json({ error: 'Permission denied. Only repository owner can upload files.' });
    }

    const branch = req.params.branch || req.body.branch || repo.defaultBranch || 'main';
    const { message = 'Upload files', description = '' } = req.body;
    let paths = req.body.paths;

    if (!paths) {
      paths = req.files.map(f => f.originalname);
    } else if (typeof paths === 'string') {
      try {
        paths = JSON.parse(paths);
      } catch (_) {
        paths = [paths];
      }
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files were uploaded.' });
    }

    const filesChanged = [];
    const timestamp = new Date();

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      let relPath = (paths[i] || file.originalname).replace(/^\/+/, '').replace(/\\/g, '/');
      const mimeType = file.mimetype || mime.lookup(relPath) || 'application/octet-stream';

      // 1. Upload to Filebase S3, preserving complete repository path
      const storageRef = await storageService.uploadFile(
        String(repo._id),
        branch,
        relPath,
        file.buffer,
        mimeType
      );

      // Check existing FileNode
      const existing = await FileNode.findOne({
        repoId: String(repo._id),
        branch,
        path: relPath
      });

      const status = existing ? 'modified' : 'added';
      const isText = !mimeType.startsWith('image/') && !mimeType.includes('octet-stream');
      const additions = isText ? file.buffer.toString('utf8').split('\n').length : 1;

      filesChanged.push({
        path: relPath,
        status,
        additions,
        deletions: 0
      });

      if (existing) {
        await FileNode.updateOne(
          { _id: existing._id },
          {
            $set: {
              size: file.buffer.length,
              mimeType,
              storage: storageRef,
              lastCommitMessage: message,
              lastCommitAuthor: req.user.username,
              lastCommitDate: timestamp,
              updatedAt: timestamp
            }
          }
        );
      } else {
        await FileNode.create({
          repoId: String(repo._id),
          branch,
          path: relPath,
          name: path.basename(relPath),
          type: 'file',
          size: file.buffer.length,
          mimeType,
          storage: storageRef,
          lastCommitMessage: message,
          lastCommitAuthor: req.user.username,
          lastCommitDate: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      }
    }

    // Record git commit
    const commit = await gitService.recordCommit({
      repoId: String(repo._id),
      branchName: branch,
      message,
      description,
      author: req.user,
      filesChanged
    });

    // Update FileNodes with commit SHA
    for (const f of filesChanged) {
      await FileNode.updateOne(
        { repoId: String(repo._id), branch, path: f.path },
        { $set: { lastCommitSha: commit.sha } }
      );
    }

    // Refresh runner detection
    await runnerService.detectAndTagRepo(String(repo._id), branch);

    res.json({
      success: true,
      commit,
      filesUploaded: req.files.length
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to upload files: ' + err.message });
  }
});

// POST /api/files/:owner/:repo/create - Create single file in browser editor
router.post('/:owner/:repo/create', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    if (repo.ownerUsername !== req.user.username) {
      return res.status(403).json({ error: 'Only repository owner can create files.' });
    }

    const { path: rawPath, content = '', branch = 'main', message, description = '' } = req.body;
    if (!rawPath) return res.status(400).json({ error: 'File path is required.' });

    const cleanPath = rawPath.replace(/^\/+/, '').replace(/\\/g, '/');
    const commitMessage = message || `Create ${path.basename(cleanPath)}`;
    const mimeType = mime.lookup(cleanPath) || 'text/plain';

    // 1. Upload to Filebase S3
    const storageRef = await storageService.uploadFile(
      String(repo._id),
      branch,
      cleanPath,
      content,
      mimeType
    );

    // 2. Commit
    const lines = content.split('\n').length;
    const commit = await gitService.recordCommit({
      repoId: String(repo._id),
      branchName: branch,
      message: commitMessage,
      description,
      author: req.user,
      filesChanged: [{
        path: cleanPath,
        status: 'added',
        additions: lines,
        deletions: 0
      }]
    });

    // 3. Save FileNode
    const node = await FileNode.create({
      repoId: String(repo._id),
      branch,
      path: cleanPath,
      name: path.basename(cleanPath),
      type: 'file',
      size: Buffer.byteLength(content),
      mimeType,
      storage: storageRef,
      lastCommitSha: commit.sha,
      lastCommitMessage: commitMessage,
      lastCommitAuthor: req.user.username,
      lastCommitDate: new Date()
    });

    res.status(201).json({ success: true, file: node, commit });
  } catch (err) {
    console.error('Create file error:', err);
    res.status(500).json({ error: 'Failed to create file.' });
  }
});

// PUT /api/files/:owner/:repo/edit - Edit file in browser editor (with rename support)
router.put('/:owner/:repo/edit', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    if (repo.ownerUsername !== req.user.username) {
      return res.status(403).json({ error: 'Only repository owner can edit files.' });
    }

    const { path: rawPath, oldPath: rawOldPath, content = '', branch = 'main', message, description = '' } = req.body;
    const cleanPath = rawPath.replace(/^\/+/, '').replace(/\\/g, '/');
    const cleanOldPath = rawOldPath ? rawOldPath.replace(/^\/+/, '').replace(/\\/g, '/') : null;
    const isRename = Boolean(cleanOldPath && cleanOldPath !== cleanPath);

    const sourcePathForOld = isRename ? cleanOldPath : cleanPath;
    const defaultMsg = isRename
      ? `Rename ${path.basename(cleanOldPath)} to ${path.basename(cleanPath)}`
      : `Update ${path.basename(cleanPath)}`;
    const commitMessage = message || defaultMsg;
    const mimeType = mime.lookup(cleanPath) || 'text/plain';

    // Get old content for diff
    let oldContent = '';
    try {
      const oldObj = await storageService.getFile(String(repo._id), branch, sourcePathForOld);
      oldContent = oldObj.buffer.toString('utf8');
    } catch (_) {}

    const { additions, deletions, patch } = gitService.computeDiff(oldContent, content, cleanPath);

    // 1. Upload updated content to Filebase S3
    const storageRef = await storageService.uploadFile(
      String(repo._id),
      branch,
      cleanPath,
      content,
      mimeType
    );

    // 2. If renamed, delete old file from Filebase and DB
    if (isRename) {
      try {
        await storageService.deleteFile(String(repo._id), branch, cleanOldPath);
      } catch (_) {}
      await FileNode.deleteOne({ repoId: String(repo._id), branch, path: cleanOldPath });
    }

    // 3. Commit
    const filesChanged = isRename
      ? [
          {
            path: cleanOldPath,
            status: 'deleted',
            additions: 0,
            deletions: oldContent ? oldContent.split('\n').length : 0
          },
          {
            path: cleanPath,
            oldPath: cleanOldPath,
            status: 'renamed',
            additions,
            deletions,
            patch
          }
        ]
      : [
          {
            path: cleanPath,
            status: 'modified',
            additions,
            deletions,
            patch
          }
        ];

    const commit = await gitService.recordCommit({
      repoId: String(repo._id),
      branchName: branch,
      message: commitMessage,
      description,
      author: req.user,
      filesChanged
    });

    // 4. Update or create FileNode
    const existingNode = await FileNode.findOne({ repoId: String(repo._id), branch, path: cleanPath });
    if (existingNode) {
      await FileNode.updateOne(
        { _id: existingNode._id },
        {
          $set: {
            size: Buffer.byteLength(content),
            mimeType,
            storage: storageRef,
            lastCommitSha: commit.sha,
            lastCommitMessage: commitMessage,
            lastCommitAuthor: req.user.username,
            lastCommitDate: new Date(),
            updatedAt: new Date()
          }
        }
      );
    } else {
      await FileNode.create({
        repoId: String(repo._id),
        branch,
        path: cleanPath,
        name: path.basename(cleanPath),
        type: 'file',
        size: Buffer.byteLength(content),
        mimeType,
        storage: storageRef,
        lastCommitSha: commit.sha,
        lastCommitMessage: commitMessage,
        lastCommitAuthor: req.user.username,
        lastCommitDate: new Date()
      });
    }

    // Refresh runner detection
    await runnerService.detectAndTagRepo(String(repo._id), branch);

    res.json({ success: true, commit, newPath: cleanPath });
  } catch (err) {
    console.error('Edit file error:', err);
    res.status(500).json({ error: 'Failed to update file.' });
  }
});

// POST /api/files/:owner/:repo/rename - Rename or move a file or folder directly
router.post('/:owner/:repo/rename', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    if (repo.ownerUsername !== req.user.username) {
      return res.status(403).json({ error: 'Only repository owner can rename files.' });
    }

    const { oldPath: rawOld, newPath: rawNew, branch = 'main', message } = req.body;
    if (!rawOld || !rawNew) {
      return res.status(400).json({ error: 'Both oldPath and newPath are required.' });
    }

    const oldPath = rawOld.replace(/^\/+/, '').replace(/\\/g, '/');
    const newPath = rawNew.replace(/^\/+/, '').replace(/\\/g, '/');
    if (oldPath === newPath) {
      return res.status(400).json({ error: 'New path is identical to current path.' });
    }

    const commitMsg = message || `Rename ${oldPath} to ${newPath}`;
    const filesChanged = [];

    // Check if single file
    const fileNode = await FileNode.findOne({ repoId: String(repo._id), branch, path: oldPath });

    if (fileNode) {
      // Single file rename
      const fileObj = await storageService.getFile(String(repo._id), branch, oldPath);
      const mimeType = mime.lookup(newPath) || fileNode.mimeType || 'text/plain';

      // Upload to new path
      const storageRef = await storageService.uploadFile(
        String(repo._id),
        branch,
        newPath,
        fileObj.buffer,
        mimeType
      );

      // Delete old from Filebase
      try {
        await storageService.deleteFile(String(repo._id), branch, oldPath);
      } catch (_) {}

      // Replace FileNode
      await FileNode.deleteOne({ repoId: String(repo._id), branch, path: oldPath });
      await FileNode.create({
        repoId: String(repo._id),
        branch,
        path: newPath,
        name: path.basename(newPath),
        type: 'file',
        size: fileNode.size,
        mimeType,
        storage: storageRef,
        lastCommitMessage: commitMsg,
        lastCommitAuthor: req.user.username,
        lastCommitDate: new Date()
      });

      filesChanged.push({
        path: newPath,
        oldPath,
        status: 'renamed',
        additions: 0,
        deletions: 0
      });
    } else {
      // Folder rename: find all files starting with oldPath + '/'
      const folderPrefix = oldPath + '/';
      const allFiles = await FileNode.find({ repoId: String(repo._id), branch });
      const matchingFiles = allFiles.filter(f => f.path.startsWith(folderPrefix));

      if (matchingFiles.length === 0) {
        return res.status(404).json({ error: `File or folder "${oldPath}" not found.` });
      }

      for (const f of matchingFiles) {
        const subPath = f.path.substring(folderPrefix.length);
        const itemNewPath = `${newPath}/${subPath}`;
        const fileObj = await storageService.getFile(String(repo._id), branch, f.path);
        const mimeType = mime.lookup(itemNewPath) || f.mimeType || 'text/plain';

        const storageRef = await storageService.uploadFile(
          String(repo._id),
          branch,
          itemNewPath,
          fileObj.buffer,
          mimeType
        );

        try {
          await storageService.deleteFile(String(repo._id), branch, f.path);
        } catch (_) {}

        await FileNode.deleteOne({ repoId: String(repo._id), branch, path: f.path });
        await FileNode.create({
          repoId: String(repo._id),
          branch,
          path: itemNewPath,
          name: path.basename(itemNewPath),
          type: 'file',
          size: f.size,
          mimeType,
          storage: storageRef,
          lastCommitMessage: commitMsg,
          lastCommitAuthor: req.user.username,
          lastCommitDate: new Date()
        });

        filesChanged.push({
          path: itemNewPath,
          oldPath: f.path,
          status: 'renamed',
          additions: 0,
          deletions: 0
        });
      }
    }

    // Record commit
    const commit = await gitService.recordCommit({
      repoId: String(repo._id),
      branchName: branch,
      message: commitMsg,
      author: req.user,
      filesChanged
    });

    // Refresh runner detection
    await runnerService.detectAndTagRepo(String(repo._id), branch);

    res.json({ success: true, commit, newPath });
  } catch (err) {
    console.error('Rename error:', err);
    res.status(500).json({ error: 'Failed to rename: ' + err.message });
  }
});

// DELETE /api/files/:owner/:repo/delete - Delete file or folder
router.delete('/:owner/:repo/delete', requireAuth, async (req, res) => {
  try {
    const repo = await getRepo(req.params.owner, req.params.repo, req.user);
    if (!repo) return res.status(404).json({ error: 'Repository not found' });
    if (repo.ownerUsername !== req.user.username) {
      return res.status(403).json({ error: 'Only repository owner can delete files.' });
    }

    const { path: rawPath, branch = 'main', message } = req.body;
    const cleanPath = rawPath.replace(/^\/+/, '').replace(/\\/g, '/');
    const commitMessage = message || `Delete ${path.basename(cleanPath)}`;

    // Check if single file
    const fileNode = await FileNode.findOne({ repoId: String(repo._id), branch, path: cleanPath });
    const filesChanged = [];

    if (fileNode) {
      // Delete single file from Filebase S3
      try {
        await storageService.deleteFile(String(repo._id), branch, cleanPath);
      } catch (_) {}

      // Delete FileNode
      await FileNode.deleteOne({
        repoId: String(repo._id),
        branch,
        path: cleanPath
      });

      filesChanged.push({
        path: cleanPath,
        status: 'deleted',
        additions: 0,
        deletions: 1
      });
    } else {
      // Directory delete: all files starting with cleanPath + '/'
      const folderPrefix = cleanPath + '/';
      const allFiles = await FileNode.find({ repoId: String(repo._id), branch });
      const filesInFolder = allFiles.filter(f => f.path.startsWith(folderPrefix));

      if (filesInFolder.length === 0) {
        return res.status(404).json({ error: `File or folder "${cleanPath}" not found.` });
      }

      for (const f of filesInFolder) {
        try {
          await storageService.deleteFile(String(repo._id), branch, f.path);
        } catch (_) {}
        await FileNode.deleteOne({ repoId: String(repo._id), branch, path: f.path });
        filesChanged.push({
          path: f.path,
          status: 'deleted',
          additions: 0,
          deletions: 1
        });
      }
    }

    // Record commit
    const commit = await gitService.recordCommit({
      repoId: String(repo._id),
      branchName: branch,
      message: commitMessage,
      author: req.user,
      filesChanged
    });

    // Refresh runner detection
    await runnerService.detectAndTagRepo(String(repo._id), branch);

    res.json({ success: true, commit });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Failed to delete: ' + err.message });
  }
});

module.exports = router;
