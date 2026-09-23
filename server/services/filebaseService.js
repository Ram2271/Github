/**
 * Legacy FilebaseService Alias
 * Seamlessly delegates all operations to the new Google Drive StorageService.
 */
const storageService = require('./storageService');

module.exports = storageService;
