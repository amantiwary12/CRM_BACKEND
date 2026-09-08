const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { clampLimit } = require('../utils/helpers');

router.use(protect);

// .lean() (used below for list performance) returns plain objects and skips
// the User schema's toJSON transform, so sensitive fields must be excluded
// explicitly here rather than relying on that transform to strip them.
const PUBLIC_USER_FIELDS = '-password -resetPasswordToken -resetPasswordExpire -invitationToken -invitationExpire';

router.get('/', async (req, res) => {
  try {
    const { page = 1, search, role, status } = req.query;
    const limit = clampLimit(req.query.limit, { max: 100, fallback: 50 });

    const filter = { organizationId: req.user.organizationId };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) filter.role = role;
    if (status) filter.status = status;

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select(PUBLIC_USER_FIELDS)
        .sort('name')
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', authorize('admin', 'manager'), async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).select('-resetPasswordToken -resetPasswordExpire');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/invite', authorize('admin'), async (req, res) => {
  try {
    const { email, role, name } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const crypto = require('crypto');
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpire = Date.now() + 7 * 24 * 60 * 60 * 1000;

    const user = await User.create({
      name: name || email.split('@')[0],
      email,
      role: role || 'representative',
      organizationId: req.user.organizationId,
      password: crypto.randomBytes(16).toString('hex'),
      invitationToken,
      invitationExpire,
      status: 'inactive'
    });

    res.status(201).json({
      success: true,
      data: {
        message: 'Invitation sent successfully',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role
        },
        invitationToken
      }
    });
  } catch (error) {
    console.error('Invite user error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id/role', authorize('admin'), async (req, res) => {
  try {
    const { role } = req.body;

    const validRoles = ['admin', 'manager', 'representative'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
    }

    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot change your own role' });
    }

    const user = await User.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      success: true,
      data: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    console.error('Change user role error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id/deactivate', authorize('admin'), async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate yourself' });
    }

    const user = await User.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.status = 'inactive';
    await user.save();

    res.status(200).json({
      success: true,
      data: {
        message: 'User deactivated successfully',
        user: { id: user._id, name: user.name, email: user.email, status: user.status }
      }
    });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id/activate', authorize('admin'), async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.status = 'active';
    await user.save();

    res.status(200).json({
      success: true,
      data: {
        message: 'User activated successfully',
        user: { id: user._id, name: user.name, email: user.email, status: user.status }
      }
    });
  } catch (error) {
    console.error('Activate user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
