const { getModel } = require('../config/db');

/**
 * Issue Model
 * Fields:
 * - repoId: String
 * - number: Number (e.g. #1, #2)
 * - title: String
 * - body: String
 * - author: { userId, username, avatarUrl }
 * - state: 'open' | 'closed'
 * - labels: Array<{ name: String, color: String }>
 * - comments: Array<{ id, author: { userId, username, avatarUrl }, body, createdAt }>
 * - closedAt: Date | null
 * - createdAt: Date
 * - updatedAt: Date
 */
const Issue = getModel('Issue');

module.exports = Issue;
