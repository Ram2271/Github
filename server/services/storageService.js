const googleDriveStorage = require('../config/googleDrive');

class StorageService {
  /**
   * Builds the canonical object key, preserving complete repo path
   * e.g. "66f1.../main/src/components/Header.jsx"
   */
  buildKey(repoId, branch, relativePath) {
    const cleanPath = (relativePath || '').replace(/^\/+/, '').replace(/\\/g, '/');
    return `${repoId}/${branch}/${cleanPath}`;
  }

  /**
   * Uploads file content to Google Drive cloud storage preserving repository path
   */
  async uploadFile(repoId, branch, relativePath, content, mimeType) {
    const key = this.buildKey(repoId, branch, relativePath);
    return await googleDriveStorage.uploadObject(key, content, mimeType);
  }

  /**
   * Retrieves file content buffer from Google Drive
   */
  async getFile(repoId, branch, relativePath, fileId = null) {
    const key = this.buildKey(repoId, branch, relativePath);
    return await googleDriveStorage.getObject(key, fileId);
  }

  /**
   * Deletes a file from Google Drive
   */
  async deleteFile(repoId, branch, relativePath) {
    const key = this.buildKey(repoId, branch, relativePath);
    return await googleDriveStorage.deleteObject(key);
  }

  /**
   * Copies file objects from one branch to another in Google Drive
   */
  async duplicateFileToBranch(repoId, fromBranch, toBranch, relativePath, fileNode) {
    const source = await this.getFile(repoId, fromBranch, relativePath);
    const newKey = this.buildKey(repoId, toBranch, relativePath);
    return await googleDriveStorage.uploadObject(newKey, source.buffer, source.contentType);
  }

  /**
   * Check if Google Drive is configured
   */
  isConfigured() {
    return googleDriveStorage.isConfigured();
  }
}

module.exports = new StorageService();
