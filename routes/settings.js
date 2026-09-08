const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Organization = require('../models/Organization');
const PipelineStage = require('../models/PipelineStage');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect);

// GET /api/settings — workspace settings
router.get('/', async (req, res) => {
  try {
    const organization = await Organization.findById(req.user.organizationId);
    if (!organization) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }
    res.status(200).json({ success: true, data: organization });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/settings — update workspace settings (admin only)
router.put('/', authorize('admin'), async (req, res) => {
  try {
    const { name, industry, currency, timezone } = req.body;
    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (industry !== undefined) updateFields.industry = industry;
    if (currency !== undefined) updateFields.currency = currency;
    if (timezone !== undefined) updateFields.timezone = timezone;

    const organization = await Organization.findByIdAndUpdate(
      req.user.organizationId,
      updateFields,
      { new: true, runValidators: true }
    );

    if (!organization) {
      return res.status(404).json({ success: false, message: 'Organization not found' });
    }
    res.status(200).json({ success: true, data: organization });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/settings/profile — update own profile
router.put('/profile', async (req, res) => {
  try {
    const { name } = req.body;
    const updateFields = {};
    if (name) updateFields.name = name;

    const user = await User.findByIdAndUpdate(req.user._id, updateFields, { new: true, runValidators: true });
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/settings/password — change own password
router.put('/password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Both passwords are required' });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, data: { message: 'Password changed successfully' } });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/settings/pipeline-stages
router.get('/pipeline-stages', async (req, res) => {
  try {
    const stages = await PipelineStage.find({
      organizationId: req.user.organizationId,
      active: true,
    }).sort('order');
    res.status(200).json({ success: true, data: stages });
  } catch (error) {
    console.error('Get pipeline stages error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/settings/pipeline-stages
router.post('/pipeline-stages', authorize('admin'), async (req, res) => {
  try {
    const { name, order, probability, type } = req.body;
    const existingStage = await PipelineStage.findOne({ name, organizationId: req.user.organizationId });
    if (existingStage) {
      return res.status(400).json({ success: false, message: 'Stage with this name already exists' });
    }

    let stageOrder = order;
    if (!stageOrder && stageOrder !== 0) {
      const maxOrderStage = await PipelineStage.findOne({ organizationId: req.user.organizationId }).sort('-order');
      stageOrder = maxOrderStage ? maxOrderStage.order + 1 : 1;
    }

    const stage = await PipelineStage.create({
      name,
      order: stageOrder,
      probability: probability || 0,
      type: type || 'progress',
      organizationId: req.user.organizationId,
    });
    res.status(201).json({ success: true, data: stage });
  } catch (error) {
    console.error('Create pipeline stage error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/settings/pipeline-stages/:id
router.put('/pipeline-stages/:id', authorize('admin'), async (req, res) => {
  try {
    const stage = await PipelineStage.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!stage) {
      return res.status(404).json({ success: false, message: 'Pipeline stage not found' });
    }
    const updatedStage = await PipelineStage.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.status(200).json({ success: true, data: updatedStage });
  } catch (error) {
    console.error('Update pipeline stage error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/settings/pipeline-stages/:id
router.delete('/pipeline-stages/:id', authorize('admin'), async (req, res) => {
  try {
    const stage = await PipelineStage.findOne({ _id: req.params.id, organizationId: req.user.organizationId });
    if (!stage) {
      return res.status(404).json({ success: false, message: 'Pipeline stage not found' });
    }
    stage.active = false;
    await stage.save();
    res.status(200).json({ success: true, data: { message: 'Pipeline stage deactivated' } });
  } catch (error) {
    console.error('Delete pipeline stage error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/settings/pipeline/reorder
router.put('/pipeline/reorder', authorize('admin'), async (req, res) => {
  try {
    const { stages } = req.body;
    if (!stages || !Array.isArray(stages)) {
      return res.status(400).json({ success: false, message: 'Stages array is required' });
    }
    for (const s of stages) {
      await PipelineStage.findOneAndUpdate(
        { _id: s.id, organizationId: req.user.organizationId },
        { order: s.order }
      );
    }
    res.status(200).json({ success: true, data: { message: 'Order updated' } });
  } catch (error) {
    console.error('Reorder stages error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/settings/sources — get lead sources
router.get('/sources', async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    res.status(200).json({ success: true, data: org?.leadSources || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/settings/sources — add lead source
router.post('/sources', authorize('admin'), async (req, res) => {
  try {
    const { source } = req.body;
    if (!source) return res.status(400).json({ success: false, message: 'Source name is required' });

    const org = await Organization.findById(req.user.organizationId);
    if (!org.leadSources.includes(source)) {
      org.leadSources.push(source);
      await org.save();
    }
    res.status(201).json({ success: true, data: org.leadSources });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE /api/settings/sources/:source — remove lead source
router.delete('/sources/:source', authorize('admin'), async (req, res) => {
  try {
    const source = decodeURIComponent(req.params.source);
    const org = await Organization.findById(req.user.organizationId);
    org.leadSources = org.leadSources.filter(s => s !== source);
    await org.save();
    res.status(200).json({ success: true, data: org.leadSources });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
