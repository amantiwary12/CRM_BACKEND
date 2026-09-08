const express = require('express');
const router = express.Router();
const Contact = require('../models/Contact');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const Note = require('../models/Note');
const Task = require('../models/Task');
const { protect } = require('../middleware/auth');
const { clampLimit } = require('../utils/helpers');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const {
      search, company, page = 1, sort = '-createdAt'
    } = req.query;
    const limit = clampLimit(req.query.limit);

    const filter = { organizationId: req.user.organizationId };

    if (company) filter.companyId = company;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { jobTitle: { $regex: search, $options: 'i' } }
      ];
    }

    const [total, contacts] = await Promise.all([
      Contact.countDocuments(filter),
      Contact.find(filter)
        .populate('companyId', 'name')
        .populate('ownerId', 'name email')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        contacts,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    })
      .populate('companyId', 'name industry website')
      .populate('ownerId', 'name email');

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    const deals = await Deal.find({
      contactId: contact._id,
      organizationId: req.user.organizationId
    }).sort('-createdAt');

    const activities = await Activity.find({
      relatedEntityType: 'Contact',
      relatedEntityId: contact._id,
      organizationId: req.user.organizationId
    }).sort('-activityAt');

    const notes = await Note.find({
      relatedEntityType: 'Contact',
      relatedEntityId: contact._id,
      organizationId: req.user.organizationId
    }).sort('-createdAt');

    const tasks = await Task.find({
      relatedEntityType: 'Contact',
      relatedEntityId: contact._id,
      organizationId: req.user.organizationId
    }).sort('-dueAt');

    res.status(200).json({
      success: true,
      data: { contact, deals, activities, notes, tasks }
    });
  } catch (error) {
    console.error('Get contact error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const contactData = {
      ...req.body,
      organizationId: req.user.organizationId,
      ownerId: req.body.ownerId || req.user._id
    };

    const contact = await Contact.create(contactData);
    await contact.populate('companyId', 'name');

    res.status(201).json({ success: true, data: contact });
  } catch (error) {
    console.error('Create contact error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    let contact = await Contact.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    contact = await Contact.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('companyId', 'name');

    res.status(200).json({ success: true, data: contact });
  } catch (error) {
    console.error('Update contact error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    await contact.deleteOne();

    res.status(200).json({ success: true, data: { message: 'Contact deleted successfully' } });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    res.status(200).json({ success: true, data: contact });
  } catch (error) {
    console.error('Restore contact error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
