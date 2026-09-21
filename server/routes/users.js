const express = require('express');
const User = require('../models/User');
const Repository = require('../models/Repository');
const Activity = require('../models/Activity');
const Notification = require('../models/Notification');
const { requireAuth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/:username
router.get('/:username', optionalAuth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userObj = { ...user };
    delete userObj.password;

    // Is current user following this profile?
    let isFollowing = false;
    if (req.user) {
      isFollowing = (user.followers || []).includes(String(req.user._id));
    }

    // Get public repo count
    const publicReposCount = await Repository.countDocuments({
      ownerUsername: user.username,
      visibility: 'public'
    });

    res.json({
      user: userObj,
      isFollowing,
      stats: {
        publicRepos: publicReposCount,
        followers: (user.followers || []).length,
        following: (user.following || []).length,
        stars: (user.starredRepos || []).length
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// POST /api/users/:username/follow
router.post('/:username/follow', requireAuth, async (req, res) => {
  try {
    const targetUser = await User.findOne({ username: req.params.username.toLowerCase() });
    if (!targetUser) return res.status(404).json({ error: 'User not found' });
    if (String(targetUser._id) === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot follow yourself.' });
    }

    const isFollowing = (targetUser.followers || []).includes(String(req.user._id));

    if (isFollowing) {
      // Unfollow
      await User.updateOne({ _id: targetUser._id }, { $pull: { followers: String(req.user._id) } });
      await User.updateOne({ _id: req.user._id }, { $pull: { following: String(targetUser._id) } });
    } else {
      // Follow
      await User.updateOne({ _id: targetUser._id }, { $push: { followers: String(req.user._id) } });
      await User.updateOne({ _id: req.user._id }, { $push: { following: String(targetUser._id) } });

      // Notify target user
      await Notification.create({
        recipientId: String(targetUser._id),
        type: 'follow',
        title: 'New Follower',
        message: `${req.user.username} started following you.`,
        link: `/${req.user.username}`,
        sender: { username: req.user.username, avatarUrl: req.user.avatarUrl },
        repoName: '',
        read: false
      });
    }

    res.json({ following: !isFollowing });
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle follow' });
  }
});

// GET /api/users/:username/repos
router.get('/:username/repos', optionalAuth, async (req, res) => {
  try {
    const isSelf = req.user && req.user.username === req.params.username.toLowerCase();
    const query = {
      ownerUsername: req.params.username.toLowerCase()
    };
    if (!isSelf) {
      query.visibility = 'public';
    }

    const repos = await Repository.find(query).sort({ updatedAt: -1 });
    res.json({ repositories: repos });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user repositories' });
  }
});

// GET /api/users/:username/starred
router.get('/:username/starred', async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const starredIds = user.starredRepos || [];
    const repos = await Repository.find({ _id: { $in: starredIds }, visibility: 'public' });
    res.json({ repositories: repos });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch starred repos' });
  }
});

// GET /api/users/:username/activity
router.get('/:username/activity', async (req, res) => {
  try {
    const activities = await Activity.find({ username: req.params.username.toLowerCase() });
    
    // Group by date for the contribution calendar
    const calendarMap = {};
    for (const act of activities) {
      calendarMap[act.date] = (calendarMap[act.date] || 0) + (act.count || 1);
    }

    const recentActivities = await Activity.find({ username: req.params.username.toLowerCase() })
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({
      calendar: calendarMap,
      recent: recentActivities,
      totalContributions: Object.values(calendarMap).reduce((a, b) => a + b, 0)
    });
  } catch (err) {
    console.error('[ActivityError]', err);
    res.status(500).json({ error: 'Failed to fetch activity history: ' + err.message });
  }
});

module.exports = router;
