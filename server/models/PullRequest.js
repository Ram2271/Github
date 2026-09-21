const { getModel } = require('../config/db');

/**
 * PullRequest Model
 */
const PullRequest = getModel('PullRequest');

module.exports = PullRequest;
