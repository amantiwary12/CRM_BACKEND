const express = require('express');
const router = express.Router();
const Activity = require('../models/Activity');
const { protect } = require('../middleware/auth');
const { clampLimit } = require('../utils/helpers');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const {
      relatedEntityType, relatedEntityId, type,
      page = 1, sort = '-activityAt'
    } = req.query;
    const limit = clampLimit(req.query.limit, { max: 100, fallback: 50 });

    const filter = { organizationId: req.user.organizationId };

    if (relatedEntityType) filter.relatedEntityType = relatedEntityType;
    if (relatedEntityId) filter.relatedEntityId = relatedEntityId;
    if (type) filter.type = type;

    const [total, activities] = await Promise.all([
      Activity.countDocuments(filter),
      Activity.find(filter)
        .populate('userId', 'name email')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        activities,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { relatedEntityType, relatedEntityId, type, description, outcome } = req.body;

    if (!relatedEntityType || !relatedEntityId || !type) {
      return res.status(400).json({
        success: false,
        message: 'relatedEntityType, relatedEntityId, and type are required'
      });
    }

    const validTypes = ['call', 'meeting', 'email', 'demo', 'note'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid activity type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const activity = await Activity.create({
      relatedEntityType,
      relatedEntityId,
      type,
      description,
      outcome,
      userId: req.user._id,
      organizationId: req.user.organizationId
    });

    await activity.populate('userId', 'name email');

    res.status(201).json({ success: true, data: activity });
  } catch (error) {
    console.error('Create activity error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const activity = await Activity.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!activity) {
      return res.status(404).json({ success: false, message: 'Activity not found' });
    }

    if (activity.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this activity' });
    }

    await activity.deleteOne();

    res.status(200).json({ success: true, data: { message: 'Activity deleted successfully' } });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
