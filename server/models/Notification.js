const { getModel } = require('../config/db');

/**
 * Notification Model
 * Fields:
 * - recipientId: String
 * - type: 'star' | 'fork' | 'issue' | 'comment' | 'pr' | 'merge'
 * - title: String
 * - message: String
 * - link: String
 * - sender: { username, avatarUrl }
 * - repoName: String
 * - read: Boolean
 * - createdAt: Date
 */
const Notification = getModel('Notification');

module.exports = Notification;
