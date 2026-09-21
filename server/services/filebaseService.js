const filebaseStorage = require('../config/filebase');

class FilebaseService {
  /**
   * Builds the canonical Filebase S3 object key, preserving complete repo path
   * e.g. "66f1.../main/src/components/Header.jsx"
   */
  buildKey(repoId, branch, relativePath) {
    const cleanPath = relativePath.replace(/^\/+/, '').replace(/\\/g, '/');
    return `${repoId}/${branch}/${cleanPath}`;
  }

  /**
   * Uploads file content to Filebase S3 preserving repository path
   */
  async uploadFile(repoId, branch, relativePath, content, mimeType) {
    const key = this.buildKey(repoId, branch, relativePath);
    return await filebaseStorage.uploadObject(key, content, mimeType);
  }

  /**
   * Retrieves file content buffer from Filebase
   */
  async getFile(repoId, branch, relativePath) {
    const key = this.buildKey(repoId, branch, relativePath);
    return await filebaseStorage.getObject(key);
  }

  /**
   * Deletes a file from Filebase
   */
  async deleteFile(repoId, branch, relativePath) {
    const key = this.buildKey(repoId, branch, relativePath);
    return await filebaseStorage.deleteObject(key);
  }

  /**
   * Copies file objects from one branch to another in Filebase
   */
  async duplicateFileToBranch(repoId, fromBranch, toBranch, relativePath, fileNode) {
    const source = await this.getFile(repoId, fromBranch, relativePath);
    const newKey = this.buildKey(repoId, toBranch, relativePath);
    return await filebaseStorage.uploadObject(newKey, source.buffer, source.contentType);
  }
}

module.exports = new FilebaseService();
