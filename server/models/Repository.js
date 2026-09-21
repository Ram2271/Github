const { getModel } = require('../config/db');

/**
 * Repository Model
 * Fields:
 * - name: String
 * - description: String
 * - owner: String (userId or username)
 * - ownerUsername: String
 * - visibility: 'public' | 'private'
 * - defaultBranch: String ('main')
 * - starsCount: Number
 * - forksCount: Number
 * - forkedFrom: Object | null ({ repoId, ownerUsername, repoName })
 * - isWebProject: Boolean (auto-detected HTML/CSS/JS)
 * - isPythonProject: Boolean (auto-detected app.py/main.py/server.py)
 * - runnerEntryPoint: String ('index.html' or 'app.py')
 * - topics: Array<String>
 * - language: String
 * - license: String
 * - createdAt: Date
 * - updatedAt: Date
 */
const Repository = getModel('Repository');

module.exports = Repository;
