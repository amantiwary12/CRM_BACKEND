const express = require('express');
const router = express.Router();
const Deal = require('../models/Deal');
const PipelineStage = require('../models/PipelineStage');
const Activity = require('../models/Activity');
const Note = require('../models/Note');
const Task = require('../models/Task');
const { protect } = require('../middleware/auth');
const { clampLimit } = require('../utils/helpers');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const {
      search, stageId, owner, status,
      startDate, endDate,
      page = 1, sort = '-createdAt'
    } = req.query;
    const limit = clampLimit(req.query.limit);

    const filter = { organizationId: req.user.organizationId };

    if (req.user.role === 'representative') {
      filter.ownerId = req.user._id;
    }

    if (stageId) filter.stageId = stageId;
    if (owner) filter.ownerId = owner;
    if (status) filter.status = status;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [total, deals] = await Promise.all([
      Deal.countDocuments(filter),
      Deal.find(filter)
        .populate('contactId', 'name email')
        .populate('companyId', 'name')
        .populate('stageId', 'name order')
        .populate('ownerId', 'name email')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        deals,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });
  } catch (error) {
    console.error('Get deals error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/kanban', async (req, res) => {
  try {
    const { owner, startDate, endDate } = req.body;

    const filter = { organizationId: req.user.organizationId };

    if (req.user.role === 'representative') {
      filter.ownerId = req.user._id;
    } else if (owner) {
      filter.ownerId = owner;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const [deals, stages] = await Promise.all([
      Deal.find(filter)
        .populate('contactId', 'name email')
        .populate('companyId', 'name')
        .populate('stageId', 'name order')
        .populate('ownerId', 'name email')
        .lean(),
      PipelineStage.find({
        organizationId: req.user.organizationId,
        active: true
      }).sort('order').lean(),
    ]);

    const kanbanData = {};
    stages.forEach(stage => {
      kanbanData[stage._id.toString()] = {
        stageId: stage._id,
        stageName: stage.name,
        stageOrder: stage.order,
        deals: [],
        totalValue: 0,
        count: 0
      };
    });

    deals.forEach(deal => {
      const stageKey = deal.stageId ? deal.stageId._id.toString() : 'unassigned';
      if (!kanbanData[stageKey]) {
        kanbanData[stageKey] = {
          stageId: deal.stageId ? deal.stageId._id : null,
          stageName: deal.stageId ? deal.stageId.name : 'Unassigned',
          stageOrder: deal.stageId ? deal.stageId.order : 999,
          deals: [],
          totalValue: 0,
          count: 0
        };
      }
      kanbanData[stageKey].deals.push(deal);
      kanbanData[stageKey].totalValue += deal.value || 0;
      kanbanData[stageKey].count += 1;
    });

    const kanbanArray = Object.values(kanbanData)
      .filter(stage => stage.count > 0)
      .sort((a, b) => a.stageOrder - b.stageOrder);

    res.status(200).json({ success: true, data: kanbanArray });
  } catch (error) {
    console.error('Get kanban error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const deal = await Deal.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    })
      .populate('contactId', 'name email phone')
      .populate('companyId', 'name industry')
      .populate('stageId', 'name order probability')
      .populate('ownerId', 'name email');

    if (!deal) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }

    const activities = await Activity.find({
      relatedEntityType: 'Deal',
      relatedEntityId: deal._id,
      organizationId: req.user.organizationId
    }).sort('-activityAt');

    const notes = await Note.find({
      relatedEntityType: 'Deal',
      relatedEntityId: deal._id,
      organizationId: req.user.organizationId
    }).sort('-createdAt');

    const tasks = await Task.find({
      relatedEntityType: 'Deal',
      relatedEntityId: deal._id,
      organizationId: req.user.organizationId
    }).sort('-dueAt');

    const timeline = [...activities, ...notes]
      .sort((a, b) => new Date(b.createdAt || b.activityAt) - new Date(a.createdAt || a.activityAt));

    res.status(200).json({
      success: true,
      data: { deal, activities, notes, tasks, timeline }
    });
  } catch (error) {
    console.error('Get deal error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const dealData = {
      ...req.body,
      organizationId: req.user.organizationId,
      ownerId: req.body.ownerId || req.user._id
    };

    const deal = await Deal.create(dealData);

    await deal.populate([
      { path: 'contactId', select: 'name email' },
      { path: 'companyId', select: 'name' },
      { path: 'stageId', select: 'name order' },
      { path: 'ownerId', select: 'name email' }
    ]);

    await Activity.create({
      relatedEntityType: 'Deal',
      relatedEntityId: deal._id,
      type: 'note',
      description: 'Deal created',
      userId: req.user._id,
      organizationId: req.user.organizationId
    });

    res.status(201).json({ success: true, data: deal });
  } catch (error) {
    console.error('Create deal error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    let deal = await Deal.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!deal) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }

    deal = await Deal.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate([
      { path: 'contactId', select: 'name email' },
      { path: 'companyId', select: 'name' },
      { path: 'stageId', select: 'name order' },
      { path: 'ownerId', select: 'name email' }
    ]);

    res.status(200).json({ success: true, data: deal });
  } catch (error) {
    console.error('Update deal error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deal = await Deal.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!deal) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }

    await deal.deleteOne();

    res.status(200).json({ success: true, data: { message: 'Deal deleted successfully' } });
  } catch (error) {
    console.error('Delete deal error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    const deal = await Deal.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!deal) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }

    res.status(200).json({ success: true, data: deal });
  } catch (error) {
    console.error('Restore deal error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id/stage', async (req, res) => {
  try {
    const { stageId, lostReason, finalValue } = req.body;

    const deal = await Deal.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!deal) {
      return res.status(404).json({ success: false, message: 'Deal not found' });
    }

    const previousStageId = deal.stageId;

    deal.stageId = stageId;

    const stage = await PipelineStage.findById(stageId);
    if (stage) {
      if (stage.type === 'closure_won') {
        deal.closedAt = new Date();
        deal.status = 'closed_won';
        if (finalValue !== undefined) {
          deal.value = finalValue;
        }
      } else if (stage.type === 'closure_lost') {
        deal.closedAt = new Date();
        deal.status = 'closed_lost';
        if (!lostReason) {
          return res.status(400).json({
            success: false,
            message: 'Lost reason is required when closing as lost'
          });
        }
        deal.lostReason = lostReason;
      }
    }

    await deal.save();

    await Activity.create({
      relatedEntityType: 'Deal',
      relatedEntityId: deal._id,
      type: 'note',
      description: `Deal stage changed`,
      userId: req.user._id,
      organizationId: req.user.organizationId,
      outcome: JSON.stringify({ previousStageId, newStageId: stageId })
    });

    await deal.populate([
      { path: 'contactId', select: 'name email' },
      { path: 'companyId', select: 'name' },
      { path: 'stageId', select: 'name order' },
      { path: 'ownerId', select: 'name email' }
    ]);

    res.status(200).json({ success: true, data: deal });
  } catch (error) {
    console.error('Update deal stage error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
