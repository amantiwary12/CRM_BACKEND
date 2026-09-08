const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const { protect } = require('../middleware/auth');
const { clampLimit } = require('../utils/helpers');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const { relatedEntityType, relatedEntityId, page = 1, sort = '-createdAt' } = req.query;
    const limit = clampLimit(req.query.limit, { max: 100, fallback: 50 });

    if (!relatedEntityType || !relatedEntityId) {
      return res.status(400).json({
        success: false,
        message: 'relatedEntityType and relatedEntityId are required'
      });
    }

    const filter = {
      relatedEntityType,
      relatedEntityId,
      organizationId: req.user.organizationId
    };

    const [total, notes] = await Promise.all([
      Note.countDocuments(filter),
      Note.find(filter)
        .populate('createdBy', 'name email')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        notes,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { relatedEntityType, relatedEntityId, content } = req.body;

    if (!relatedEntityType || !relatedEntityId || !content) {
      return res.status(400).json({
        success: false,
        message: 'relatedEntityType, relatedEntityId, and content are required'
      });
    }

    const note = await Note.create({
      relatedEntityType,
      relatedEntityId,
      content,
      createdBy: req.user._id,
      organizationId: req.user.organizationId
    });

    await note.populate('createdBy', 'name email');

    res.status(201).json({ success: true, data: note });
  } catch (error) {
    console.error('Create note error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const note = await Note.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    if (note.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to update this note' });
    }

    const updatedNote = await Note.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    res.status(200).json({ success: true, data: updatedNote });
  } catch (error) {
    console.error('Update note error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const note = await Note.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    if (note.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this note' });
    }

    await note.deleteOne();

    res.status(200).json({ success: true, data: { message: 'Note deleted successfully' } });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
