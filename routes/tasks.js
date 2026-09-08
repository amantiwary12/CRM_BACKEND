const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { clampLimit } = require('../utils/helpers');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const {
      search, status, assigneeId, priority,
      dueDateStart, dueDateEnd,
      view, page = 1, sort = '-createdAt'
    } = req.query;
    const limit = clampLimit(req.query.limit);

    const filter = { organizationId: req.user.organizationId };

    if (view === 'my_tasks') {
      filter.assigneeId = req.user._id;
    } else if (view === 'team_tasks') {
      const teamMembers = await User.find({
        organizationId: req.user.organizationId,
        managerId: req.user._id
      }).select('_id').lean();

      const teamMemberIds = teamMembers.map(m => m._id);
      teamMemberIds.push(req.user._id);
      filter.assigneeId = { $in: teamMemberIds };
    } else if (view === 'due_today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      filter.dueAt = { $gte: today, $lt: tomorrow };
    } else if (view === 'upcoming') {
      filter.dueAt = { $gte: new Date() };
      filter.status = { $ne: 'completed' };
    } else if (view === 'completed') {
      filter.status = 'completed';
    } else if (view === 'overdue') {
      filter.dueAt = { $lt: new Date() };
      filter.status = { $ne: 'completed' };
    }

    if (status) filter.status = status;
    if (assigneeId) filter.assigneeId = assigneeId;
    if (priority) filter.priority = priority;
    
    if (dueDateStart || dueDateEnd) {
      filter.dueAt = filter.dueAt || {};
      if (dueDateStart) filter.dueAt.$gte = new Date(dueDateStart);
      if (dueDateEnd) filter.dueAt.$lte = new Date(dueDateEnd);
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [total, tasks] = await Promise.all([
      Task.countDocuments(filter),
      Task.find(filter)
        .populate('assigneeId', 'name email')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    // Resolve related entity names for display
    const entityModels = {
      Lead: require('../models/Lead'),
      Contact: require('../models/Contact'),
      Company: require('../models/Company'),
      Deal: require('../models/Deal'),
    };
    const idsByType = {};
    tasks.forEach((t) => {
      if (t.relatedEntityType && t.relatedEntityId) {
        (idsByType[t.relatedEntityType] = idsByType[t.relatedEntityType] || []).push(t.relatedEntityId);
      }
    });
    const nameMap = {};
    await Promise.all(
      Object.entries(idsByType).map(async ([type, ids]) => {
        const docs = await entityModels[type].find({ _id: { $in: ids } }).select('name title').lean();
        docs.forEach((d) => { nameMap[d._id.toString()] = d.name || d.title; });
      })
    );
    const enrichedTasks = tasks.map((t) => ({
      ...t,
      relatedEntityName: t.relatedEntityId ? (nameMap[t.relatedEntityId.toString()] || null) : undefined,
    }));

    res.status(200).json({
      success: true,
      data: {
        tasks: enrichedTasks,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).populate('assigneeId', 'name email');

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const taskData = {
      ...req.body,
      organizationId: req.user.organizationId,
      assigneeId: req.body.assigneeId || req.user._id
    };

    const task = await Task.create(taskData);

    await task.populate('assigneeId', 'name email');

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    console.error('Create task error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    let task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    task = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('assigneeId', 'name email');

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    console.error('Update task error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    await task.deleteOne();

    res.status(200).json({ success: true, data: { message: 'Task deleted successfully' } });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id/complete', async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (task.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Task is already completed' });
    }

    task.status = 'completed';
    task.completedAt = new Date();
    await task.save();

    await task.populate('assigneeId', 'name email');

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    console.error('Complete task error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id/reopen', async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (task.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Task is not completed' });
    }

    task.status = 'open';
    task.completedAt = undefined;
    await task.save();

    await task.populate('assigneeId', 'name email');

    res.status(200).json({ success: true, data: task });
  } catch (error) {
    console.error('Reopen task error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
