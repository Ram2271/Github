const { getModel } = require('../config/db');

/**
 * FileNode Model
 * Stores file/directory metadata with Filebase object storage references.
 * Preserves the complete repository path for every stored file in Filebase.
 */
const FileNode = getModel('FileNode');

module.exports = FileNode;
