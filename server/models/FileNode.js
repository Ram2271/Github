const { getModel } = require('../config/db');

/**
 * FileNode Model
 * Stores file/directory metadata with Google Drive cloud storage references.
 * Preserves the complete repository path and tracks Google Drive file ID, links, and content.
 */
const FileNode = getModel('FileNode');

module.exports = FileNode;
