const crypto = require('crypto');
const Diff = require('diff');
const Commit = require('../models/Commit');
const Branch = require('../models/Branch');
const FileNode = require('../models/FileNode');
const Activity = require('../models/Activity');
const Repository = require('../models/Repository');
const runnerService = require('./runnerService');

class GitService {
  /**
   * Generates a 40-character SHA hash for a commit
   */
  generateCommitSha(repoId, branch, message, authorId, timestamp) {
    return crypto
      .createHash('sha1')
      .update(`${repoId}:${branch}:${message}:${authorId}:${timestamp}:${Math.random()}`)
      .digest('hex');
  }

  /**
   * Records a commit and updates the branch head
   */
  async recordCommit({
    repoId,
    branchName,
    message,
    description = '',
    author,
    filesChanged = [], // [{ path, status: 'added'|'modified'|'deleted', additions, deletions, patch }]
    parentSha = null
  }) {
    // Determine parent SHA if not provided
    if (!parentSha) {
      const branch = await Branch.findOne({ repoId, name: branchName });
      if (branch && branch.commitSha) {
        parentSha = branch.commitSha;
      }
    }

    const timestamp = new Date();
    const sha = this.generateCommitSha(repoId, branchName, message, author.userId || author.username, timestamp);
    const shortSha = sha.substring(0, 7);

    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const f of filesChanged) {
      totalAdditions += (f.additions || 0);
      totalDeletions += (f.deletions || 0);
    }

    const commit = await Commit.create({
      repoId,
      sha,
      shortSha,
      message,
      description,
      author: {
        userId: author.userId || author._id,
        username: author.username,
        name: author.name || author.username,
        email: author.email || `${author.username}@users.noreply.github.local`,
        avatarUrl: author.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${author.username}`
      },
      parentSha,
      branch: branchName,
      filesChanged,
      totalAdditions,
      totalDeletions,
      createdAt: timestamp
    });

    // Update or create branch pointing to this commit
    let branch = await Branch.findOne({ repoId, name: branchName });
    if (branch) {
      await Branch.updateOne(
        { _id: branch._id },
        { $set: { commitSha: sha, updatedAt: timestamp } }
      );
    } else {
      await Branch.create({
        repoId,
        name: branchName,
        commitSha: sha,
        isDefault: branchName === 'main'
      });
    }

    // Update repository updatedAt
    await Repository.updateOne(
      { _id: repoId },
      { $set: { updatedAt: timestamp } }
    );

    // Record user activity
    const dateStr = timestamp.toISOString().split('T')[0];
    const repo = await Repository.findById(repoId);
    await Activity.create({
      userId: author.userId || author._id,
      username: author.username,
      type: 'commit',
      repoId,
      repoName: repo ? repo.name : 'repository',
      details: message,
      count: 1,
      date: dateStr
    });

    // Automatically inspect repo file tree to detect web or python project runner capabilities
    await runnerService.detectAndTagRepo(repoId, branchName);

    return commit;
  }

  /**
   * Computes unified patch and additions/deletions between old and new text
   */
  computeDiff(oldText = '', newText = '', filename = 'file') {
    const patch = Diff.createTwoFilesPatch(
      `a/${filename}`,
      `b/${filename}`,
      oldText,
      newText,
      '',
      ''
    );

    let additions = 0;
    let deletions = 0;
    const lines = patch.split('\n');
    for (const line of lines) {
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')) continue;
      if (line.startsWith('+')) additions++;
      if (line.startsWith('-')) deletions++;
    }

    return { patch, additions, deletions };
  }

  /**
   * Generates diff between two branches or commits
   */
  async getDiffBetweenBranches(repoId, baseBranchName, headBranchName) {
    const baseFiles = await FileNode.find({ repoId, branch: baseBranchName, type: 'file' });
    const headFiles = await FileNode.find({ repoId, branch: headBranchName, type: 'file' });

    const baseMap = new Map(baseFiles.map(f => [f.path, f]));
    const headMap = new Map(headFiles.map(f => [f.path, f]));

    const storageService = require('./storageService');
    const changedFiles = [];
    let totalAdditions = 0;
    let totalDeletions = 0;

    // Check modified and added
    for (const [path, headFile] of headMap.entries()) {
      const baseFile = baseMap.get(path);
      if (!baseFile) {
        // Newly added
        let content = '';
        try {
          const res = await storageService.getFile(repoId, headBranchName, path);
          content = res.buffer.toString('utf8');
        } catch (_) {}
        const { patch, additions, deletions } = this.computeDiff('', content, path);
        changedFiles.push({
          path,
          status: 'added',
          additions,
          deletions,
          patch
        });
        totalAdditions += additions;
        totalDeletions += deletions;
      } else if (baseFile.storage.etag !== headFile.storage.etag) {
        // Modified
        let oldContent = '';
        let newContent = '';
        try {
          const resOld = await storageService.getFile(repoId, baseBranchName, path);
          oldContent = resOld.buffer.toString('utf8');
          const resNew = await storageService.getFile(repoId, headBranchName, path);
          newContent = resNew.buffer.toString('utf8');
        } catch (_) {}
        const { patch, additions, deletions } = this.computeDiff(oldContent, newContent, path);
        changedFiles.push({
          path,
          status: 'modified',
          additions,
          deletions,
          patch
        });
        totalAdditions += additions;
        totalDeletions += deletions;
      }
    }

    // Check deleted
    for (const [path, baseFile] of baseMap.entries()) {
      if (!headMap.has(path)) {
        let oldContent = '';
        try {
          const res = await storageService.getFile(repoId, baseBranchName, path);
          oldContent = res.buffer.toString('utf8');
        } catch (_) {}
        const { patch, additions, deletions } = this.computeDiff(oldContent, '', path);
        changedFiles.push({
          path,
          status: 'deleted',
          additions,
          deletions,
          patch
        });
        totalAdditions += additions;
        totalDeletions += deletions;
      }
    }

    return {
      filesChanged: changedFiles,
      totalAdditions,
      totalDeletions
    };
  }
}

module.exports = new GitService();
