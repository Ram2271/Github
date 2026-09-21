const { getModel } = require('../config/db');

/**
 * VerificationCode Model
 * Fields:
 * - email: String (lowercase)
 * - code: String (6-digit random code)
 * - type: String ('signup' | 'login')
 * - payload: Object (temporary signup data or login user info)
 * - expiresAt: Date
 * - createdAt: Date
 */
const VerificationCode = getModel('VerificationCode');

module.exports = VerificationCode;
