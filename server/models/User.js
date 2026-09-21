const { getModel } = require('../config/db');

/**
 * User Model
 * Fields:
 * - username: String (unique, lowercase)
 * - email: String (unique, lowercase)
 * - password: String (hashed)
 * - name: String
 * - bio: String
 * - avatarUrl: String
 * - company: String
 * - location: String
 * - website: String
 * - twitter: String
 * - followers: Array<String> (userIds)
 * - following: Array<String> (userIds)
 * - starredRepos: Array<String> (repoIds)
 * - createdAt: Date
 */
const User = getModel('User');

module.exports = User;
