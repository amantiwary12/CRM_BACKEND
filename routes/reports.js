const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Deal = require('../models/Deal');
const Task = require('../models/Task');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/leads-by-source', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const orgId = req.user.organizationId;

    const filter = { organizationId: orgId };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const data = await Lead.aggregate([
      { $match: filter },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get leads by source error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/leads-by-status', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const orgId = req.user.organizationId;

    const filter = { organizationId: orgId };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const data = await Lead.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get leads by status error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/deals-by-stage', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const orgId = req.user.organizationId;

    const filter = { organizationId: orgId };

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const data = await Deal.aggregate([
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

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get deals by stage error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/won-vs-lost', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const orgId = req.user.organizationId;

    const filter = { 
      organizationId: orgId,
      status: { $in: ['closed_won', 'closed_lost'] }
    };

    if (startDate || endDate) {
      filter.closedAt = {};
      if (startDate) filter.closedAt.$gte = new Date(startDate);
      if (endDate) filter.closedAt.$lte = new Date(endDate);
    }

    const data = await Deal.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 }, totalValue: { $sum: '$value' } } }
    ]);

    const won = data.find(d => d._id === 'closed_won') || { count: 0, totalValue: 0 };
    const lost = data.find(d => d._id === 'closed_lost') || { count: 0, totalValue: 0 };
    const total = won.count + lost.count;
    const winRate = total > 0 ? (won.count / total) * 100 : 0;

    res.status(200).json({
      success: true,
      data: { won, lost, winRate: Math.round(winRate * 100) / 100 }
    });
  } catch (error) {
    console.error('Get won vs lost error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/revenue-by-owner', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const orgId = req.user.organizationId;

    const filter = { 
      organizationId: orgId,
      status: 'closed_won'
    };

    if (startDate || endDate) {
      filter.closedAt = {};
      if (startDate) filter.closedAt.$gte = new Date(startDate);
      if (endDate) filter.closedAt.$lte = new Date(endDate);
    }

    const data = await Deal.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$ownerId',
          totalRevenue: { $sum: '$value' },
          dealCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'ownerInfo'
        }
      },
      { $unwind: '$ownerInfo' },
      {
        $project: {
          _id: 1,
          totalRevenue: 1,
          dealCount: 1,
          ownerName: '$ownerInfo.name',
          ownerEmail: '$ownerInfo.email'
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Get revenue by owner error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/overdue-followups', async (req, res) => {
  try {
    const orgId = req.user.organizationId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filter = { 
      organizationId: orgId,
      dueAt: { $lt: today },
      status: { $ne: 'completed' }
    };

    const [totalOverdue, byAssignee, byEntityType] = await Promise.all([
      Task.countDocuments(filter),
      Task.aggregate([
        { $match: filter },
        {
          $group: {
            _id: '$assigneeId',
            count: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'assigneeInfo'
          }
        },
        { $unwind: '$assigneeInfo' },
        {
          $project: {
            _id: 1,
            count: 1,
            assigneeName: '$assigneeInfo.name',
            assigneeEmail: '$assigneeInfo.email'
          }
        },
        { $sort: { count: -1 } }
      ]),
      Task.aggregate([
        { $match: filter },
        { $group: { _id: '$relatedEntityType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: { totalOverdue, byAssignee, byEntityType }
    });
  } catch (error) {
    console.error('Get overdue followups error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
