/**
 * Legacy filebaseStorage Alias
 * Seamlessly delegates all operations to googleDriveStorage.
 */
const googleDriveStorage = require('./googleDrive');

module.exports = googleDriveStorage;
