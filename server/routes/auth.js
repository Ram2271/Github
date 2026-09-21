const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const VerificationCode = require('../models/VerificationCode');
const Activity = require('../models/Activity');
const { requireAuth, generateToken } = require('../middleware/auth');
const emailService = require('../services/emailService');

const router = express.Router();

function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  const visible = name.slice(0, 2);
  const stars = '*'.repeat(Math.min(name.length - 2, 5));
  return `${visible}${stars}@${domain}`;
}

// POST /api/auth/register - Initiates registration with 6-digit email OTP
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, name, code } = req.body;

    // If code is provided directly in register payload, delegate to verification
    if (code) {
      return handleRegisterVerify(req, res);
    }

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!/^[a-z0-9-_]+$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username can only contain alphanumeric characters, hyphens, and underscores.' });
    }

    const existingUser = await User.findOne({
      $or: [{ username: cleanUsername }, { email: cleanEmail }]
    });
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email is already in use.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = emailService.generate6DigitCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store pending registration with code and 0 attempts
    await VerificationCode.deleteMany({ email: cleanEmail, type: 'signup' });
    await VerificationCode.create({
      email: cleanEmail,
      code: verificationCode,
      type: 'signup',
      attempts: 0,
      payload: {
        username: cleanUsername,
        email: cleanEmail,
        password: hashedPassword,
        name: name ? name.trim() : cleanUsername
      },
      expiresAt
    });

    // Send verification email via Developer's Gmail
    await emailService.sendVerificationEmail({
      to: cleanEmail,
      code: verificationCode,
      type: 'signup',
      username: cleanUsername
    });

    // Strictly return metadata with NO devCode
    res.status(200).json({
      requiresVerification: true,
      type: 'signup',
      email: cleanEmail,
      maskedEmail: maskEmail(cleanEmail),
      message: `A 6-digit verification code has been sent to ${cleanEmail}. Please enter it below to complete registration.`
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message || 'Failed to initiate account creation.' });
  }
});

// POST /api/auth/register-verify - Verifies 6-digit code and creates account
router.post('/register-verify', async (req, res) => {
  return handleRegisterVerify(req, res);
});

async function handleRegisterVerify(req, res) {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = String(code).trim();

    const record = await VerificationCode.findOne({
      email: cleanEmail,
      type: 'signup'
    });

    if (!record) {
      return res.status(400).json({ error: 'No pending registration found for this email, or session has expired.' });
    }

    if (new Date(record.expiresAt) < new Date()) {
      await VerificationCode.deleteMany({ email: cleanEmail, type: 'signup' });
      return res.status(400).json({ error: 'Verification code has expired (10 min limit). Please sign up again.' });
    }

    const currentAttempts = (record.attempts || 0);
    if (currentAttempts >= 5) {
      await VerificationCode.deleteMany({ email: cleanEmail, type: 'signup' });
      return res.status(400).json({ error: 'Too many incorrect attempts. This code has been invalidated. Please sign up again.' });
    }

    // Check code match
    if (record.code !== cleanCode) {
      await VerificationCode.updateOne(
        { _id: record._id },
        { $inc: { attempts: 1 } }
      );
      const remaining = 5 - (currentAttempts + 1);
      return res.status(400).json({
        error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Code invalidated.'}`
      });
    }

    // Ensure username or email was not claimed in the meantime
    const existing = await User.findOne({
      $or: [{ username: record.payload.username }, { email: cleanEmail }]
    });
    if (existing) {
      await VerificationCode.deleteMany({ email: cleanEmail, type: 'signup' });
      return res.status(400).json({ error: 'Username or email has already been taken.' });
    }

    // Create the user
    const user = await User.create({
      ...record.payload,
      bio: '',
      avatarUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${record.payload.username}`,
      company: '',
      location: '',
      website: '',
      twitter: '',
      followers: [],
      following: [],
      starredRepos: []
    });

    // Delete used verification code
    await VerificationCode.deleteMany({ email: cleanEmail, type: 'signup' });

    const token = generateToken(user);
    const userObj = { ...user };
    delete userObj.password;

    res.status(201).json({
      user: userObj,
      token,
      message: 'Account successfully created and verified!'
    });
  } catch (err) {
    console.error('Register verify error:', err);
    res.status(500).json({ error: err.message || 'Failed to verify code and create account.' });
  }
}

// POST /api/auth/login - Validates password and dispatches 6-digit email OTP
router.post('/login', async (req, res) => {
  try {
    const { login, password, code } = req.body;

    // If code is provided with login, delegate to verification
    if (code) {
      return handleLoginVerify(req, res);
    }

    if (!login || !password) {
      return res.status(400).json({ error: 'Username/email and password are required.' });
    }

    const cleanLogin = login.trim().toLowerCase();
    const user = await User.findOne({
      $or: [{ username: cleanLogin }, { email: cleanLogin }]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    // Generate 6-digit verification code
    const verificationCode = emailService.generate6DigitCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const userEmail = user.email.toLowerCase();

    // Store login verification session
    await VerificationCode.deleteMany({ email: userEmail, type: 'login' });
    await VerificationCode.create({
      email: userEmail,
      code: verificationCode,
      type: 'login',
      attempts: 0,
      payload: { userId: String(user._id) },
      expiresAt
    });

    // Send verification code strictly to user's registered email via Gmail
    await emailService.sendVerificationEmail({
      to: user.email,
      code: verificationCode,
      type: 'login',
      username: user.username
    });

    // Strictly return verification requirement with NO devCode
    res.status(200).json({
      requiresVerification: true,
      type: 'login',
      email: userEmail,
      maskedEmail: maskEmail(user.email),
      message: `A 6-digit verification code has been sent to ${maskEmail(user.email)}.`
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message || 'Failed to process sign in.' });
  }
});

// POST /api/auth/login-verify - Verifies 6-digit code and issues JWT session
router.post('/login-verify', async (req, res) => {
  return handleLoginVerify(req, res);
});

async function handleLoginVerify(req, res) {
  try {
    const { email, login, code } = req.body;
    const targetIdentifier = (email || login || '').trim().toLowerCase();
    const cleanCode = String(code || '').trim();

    if (!targetIdentifier || !cleanCode) {
      return res.status(400).json({ error: 'Email and 6-digit verification code are required.' });
    }

    // Find verification code by email directly or find user first
    let user = await User.findOne({
      $or: [{ username: targetIdentifier }, { email: targetIdentifier }]
    });

    const lookupEmail = user ? user.email.toLowerCase() : targetIdentifier;

    const record = await VerificationCode.findOne({
      email: lookupEmail,
      type: 'login'
    });

    if (!record) {
      return res.status(400).json({ error: 'No active verification session found. Please sign in again.' });
    }

    if (new Date(record.expiresAt) < new Date()) {
      await VerificationCode.deleteMany({ email: lookupEmail, type: 'login' });
      return res.status(400).json({ error: 'Verification code has expired (10 min limit). Please sign in again.' });
    }

    const currentAttempts = (record.attempts || 0);
    if (currentAttempts >= 5) {
      await VerificationCode.deleteMany({ email: lookupEmail, type: 'login' });
      return res.status(400).json({ error: 'Too many incorrect attempts. This code has been invalidated. Please sign in again.' });
    }

    // Check code match
    if (record.code !== cleanCode) {
      await VerificationCode.updateOne(
        { _id: record._id },
        { $inc: { attempts: 1 } }
      );
      const remaining = 5 - (currentAttempts + 1);
      return res.status(400).json({
        error: `Invalid verification code. ${remaining > 0 ? `${remaining} attempt(s) remaining.` : 'Code invalidated. Please sign in again.'}`
      });
    }

    if (!user) {
      user = await User.findById(record.payload?.userId);
    }

    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    // Remove used code (strictly single-use)
    await VerificationCode.deleteMany({ email: lookupEmail, type: 'login' });

    const token = generateToken(user);
    const userObj = { ...user };
    delete userObj.password;

    res.json({
      user: userObj,
      token,
      message: 'Authentication successful!'
    });
  } catch (err) {
    console.error('Login verify error:', err);
    res.status(500).json({ error: err.message || 'Failed to verify login code.' });
  }
}

// POST /api/auth/resend-code - Resend 6-digit code via Gmail
router.post('/resend-code', async (req, res) => {
  try {
    const { email, type = 'login' } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required to resend verification code.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await VerificationCode.findOne({ email: cleanEmail, type });

    if (!existing) {
      return res.status(400).json({ error: 'No active verification session found. Please start over.' });
    }

    const newCode = emailService.generate6DigitCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await VerificationCode.updateOne(
      { _id: existing._id },
      { $set: { code: newCode, attempts: 0, expiresAt, createdAt: new Date() } }
    );

    let username = '';
    if (type === 'signup' && existing.payload?.username) {
      username = existing.payload.username;
    } else {
      const user = await User.findOne({ email: cleanEmail });
      if (user) username = user.username;
    }

    await emailService.sendVerificationEmail({
      to: cleanEmail,
      code: newCode,
      type,
      username
    });

    res.json({
      success: true,
      email: cleanEmail,
      message: `A new 6-digit verification code has been dispatched to ${cleanEmail}.`
    });
  } catch (err) {
    console.error('Resend code error:', err);
    res.status(500).json({ error: err.message || 'Failed to resend verification code.' });
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const userObj = { ...req.user };
  delete userObj.password;
  res.json({ user: userObj });
});

// PUT /api/auth/profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, bio, avatarUrl, company, location, website, twitter } = req.body;
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          name: name ?? req.user.name,
          bio: bio ?? req.user.bio,
          avatarUrl: avatarUrl ?? req.user.avatarUrl,
          company: company ?? req.user.company,
          location: location ?? req.user.location,
          website: website ?? req.user.website,
          twitter: twitter ?? req.user.twitter
        }
      },
      { new: true }
    );

    const userObj = { ...updated };
    delete userObj.password;
    res.json({ user: userObj });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

module.exports = router;
