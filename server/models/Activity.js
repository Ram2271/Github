const { getModel } = require('../config/db');

/**
 * Activity Model
 * Fields:
 * - userId: String
 * - username: String
 * - type: 'commit' | 'create_repo' | 'open_issue' | 'open_pr' | 'star'
 * - repoId: String
 * - repoName: String
 * - details: String
 * - count: Number
 * - date: String (YYYY-MM-DD for heatmap grouping)
 * - createdAt: Date
 */
const Activity = getModel('Activity');

module.exports = Activity;
