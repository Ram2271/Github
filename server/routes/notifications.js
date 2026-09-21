const express = require('express');
const Notification = require('../models/Notification');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientId: String(req.user._id) })
      .sort({ createdAt: -1 })
      .limit(50);
    const unreadCount = notifications.filter(n => !n.read).length;

    res.json({
      notifications,
      unreadCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      recipientId: String(req.user._id),
      read: false
    });
    res.json({ unreadCount });
  } catch (err) {
    res.status(500).json({ error: 'Failed to count notifications' });
  }
});

// PUT /api/notifications/read
router.put('/read', requireAuth, async (req, res) => {
  try {
    const { id } = req.body;
    if (id) {
      await Notification.updateOne(
        { _id: id, recipientId: String(req.user._id) },
        { $set: { read: true } }
      );
    } else {
      // Mark all as read
      await Notification.updateMany(
        { recipientId: String(req.user._id) },
        { $set: { read: true } }
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

module.exports = router;
