const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Task = require('../models/Task');
const Activity = require('../models/Activity');
const { protect } = require('../middleware/auth');
const { clampLimit } = require('../utils/helpers');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const userId = req.user._id;
    const isAdminOrManager = ['admin', 'manager'].includes(req.user.role);

    const baseFilter = { organizationId: orgId };
    if (!isAdminOrManager) {
      baseFilter.ownerId = userId;
    }

    const dealFilter = { organizationId: orgId, status: 'open' };
    if (!isAdminOrManager) {
      dealFilter.ownerId = userId;
    }

    const wonFilter = { organizationId: orgId, status: 'closed_won' };
    if (!isAdminOrManager) {
      wonFilter.ownerId = userId;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // None of these six reads depend on one another, so run them concurrently
    // instead of paying for six sequential round trips to Mongo.
    const [totalLeads, openDeals, pipelineResult, wonResult, tasksDueToday, overdueTasks] = await Promise.all([
      Lead.countDocuments({ ...baseFilter, organizationId: orgId }),
      Deal.countDocuments(dealFilter),
      Deal.aggregate([
        { $match: dealFilter },
        { $group: { _id: null, totalValue: { $sum: '$value' } } }
      ]),
      Deal.aggregate([
        { $match: wonFilter },
        { $group: { _id: null, totalValue: { $sum: '$value' } } }
      ]),
      Task.countDocuments({
        organizationId: orgId,
        dueAt: { $gte: today, $lt: tomorrow },
        status: { $ne: 'completed' }
      }),
      Task.countDocuments({
        organizationId: orgId,
        dueAt: { $lt: today },
        status: { $ne: 'completed' }
      }),
    ]);

    const pipelineValue = pipelineResult.length > 0 ? pipelineResult[0].totalValue : 0;
    const wonValue = wonResult.length > 0 ? wonResult[0].totalValue : 0;

    res.status(200).json({
      success: true,
      data: { totalLeads, openDeals, pipelineValue, wonValue, tasksDueToday, overdueTasks }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/pipeline-chart', async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const userId = req.user._id;
    const isAdminOrManager = ['admin', 'manager'].includes(req.user.role);

    const filter = { 
      organizationId: orgId,
      status: 'open'
    };

    if (!isAdminOrManager) {
      filter.ownerId = userId;
    }

    const pipelineData = await Deal.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'pipelinestages',
          localField: 'stageId',
          foreignField: '_id',
          as: 'stage'
        }
      },
      { $unwind: { path: '$stage', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$stageId',
          stageName: { $first: '$stage.name' },
          count: { $sum: 1 },
          totalValue: { $sum: '$value' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.status(200).json({ success: true, data: pipelineData });
  } catch (error) {
    console.error('Get pipeline chart error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/lead-source-chart', async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const userId = req.user._id;
    const isAdminOrManager = ['admin', 'manager'].includes(req.user.role);

    const filter = { organizationId: orgId };

    if (!isAdminOrManager) {
      filter.ownerId = userId;
    }

    const sourceData = await Lead.aggregate([
      { $match: filter },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({ success: true, data: sourceData });
  } catch (error) {
    console.error('Get lead source chart error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/recent-activity', async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const limit = clampLimit(req.query.limit, { max: 50, fallback: 10 });

    const activities = await Activity.find({ organizationId: orgId })
      .populate('userId', 'name email')
      .sort('-activityAt')
      .limit(limit)
      .lean();

    res.status(200).json({ success: true, data: activities });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
