const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Contact = require('../models/Contact');
const Company = require('../models/Company');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { clampLimit } = require('../utils/helpers');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const {
      search, status, owner, source,
      page = 1, sort = '-createdAt'
    } = req.query;
    const limit = clampLimit(req.query.limit);

    const filter = { organizationId: req.user.organizationId };

    if (req.user.role === 'representative') {
      filter.ownerId = req.user._id;
    } else if (req.user.role === 'manager') {
      const teamMembers = await User.find({
        organizationId: req.user.organizationId,
        managerId: req.user._id
      }).select('_id').lean();

      const teamMemberIds = teamMembers.map(m => m._id);
      teamMemberIds.push(req.user._id);

      filter.ownerId = { $in: teamMemberIds };
    }

    if (status) filter.status = status;
    if (owner) filter.ownerId = owner;
    if (source) filter.source = source;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { companyName: { $regex: search, $options: 'i' } }
      ];
    }

    const [total, leads] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.find(filter)
        .populate('ownerId', 'name email')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        leads,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });
  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/duplicate-check', async (req, res) => {
  try {
    const { email, phone } = req.query;
    const filter = { organizationId: req.user.organizationId };

    if (email) filter.email = email;
    if (phone) filter.phone = phone;

    const existingLead = await Lead.findOne(filter);

    res.status(200).json({
      success: true,
      data: { isDuplicate: !!existingLead, lead: existingLead || null }
    });
  } catch (error) {
    console.error('Duplicate check error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const lead = await Lead.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).populate('ownerId', 'name email');

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const activities = await Activity.find({
      relatedEntityType: 'Lead',
      relatedEntityId: lead._id,
      organizationId: req.user.organizationId
    }).sort('-activityAt');

    res.status(200).json({ success: true, data: { lead, activities } });
  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const leadData = {
      ...req.body,
      organizationId: req.user.organizationId,
      ownerId: req.body.ownerId || req.user._id
    };

    const lead = await Lead.create(leadData);
    await lead.populate('ownerId', 'name email');

    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    console.error('Create lead error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    let lead = await Lead.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    lead = await Lead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('ownerId', 'name email');

    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    console.error('Update lead error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const lead = await Lead.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    await lead.deleteOne();

    res.status(200).json({ success: true, data: { message: 'Lead deleted successfully' } });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    const lead = await Lead.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    console.error('Restore lead error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/assign', authorize('manager', 'admin'), async (req, res) => {
  try {
    const { userId } = req.body;

    const lead = await Lead.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const assignee = await User.findOne({
      _id: userId,
      organizationId: req.user.organizationId
    });

    if (!assignee) {
      return res.status(404).json({ success: false, message: 'User not found in organization' });
    }

    lead.ownerId = userId;
    await lead.save();

    await Activity.create({
      relatedEntityType: 'Lead',
      relatedEntityId: lead._id,
      type: 'note',
      description: `Lead assigned to ${assignee.name}`,
      userId: req.user._id,
      organizationId: req.user.organizationId
    });

    await lead.populate('ownerId', 'name email');

    res.status(200).json({ success: true, data: lead });
  } catch (error) {
    console.error('Assign lead error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/bulk-assign', authorize('manager', 'admin'), async (req, res) => {
  try {
    const { leadIds, userId } = req.body;

    const assignee = await User.findOne({
      _id: userId,
      organizationId: req.user.organizationId
    });

    if (!assignee) {
      return res.status(404).json({ success: false, message: 'User not found in organization' });
    }

    const result = await Lead.updateMany(
      { _id: { $in: leadIds }, organizationId: req.user.organizationId },
      { ownerId: userId }
    );

    const activities = leadIds.map(leadId => ({
      relatedEntityType: 'Lead',
      relatedEntityId: leadId,
      type: 'note',
      description: `Lead bulk assigned to ${assignee.name}`,
      userId: req.user._id,
      organizationId: req.user.organizationId
    }));

    await Activity.insertMany(activities);

    res.status(200).json({
      success: true,
      data: { message: `${result.modifiedCount} leads assigned successfully`, modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Bulk assign leads error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/convert', async (req, res) => {
  try {
    const lead = await Lead.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    if (lead.status === 'Converted') {
      return res.status(400).json({ success: false, message: 'Lead already converted' });
    }

    let company = null;
    if (lead.companyName) {
      company = await Company.findOne({
        name: lead.companyName,
        organizationId: req.user.organizationId
      });

      if (!company) {
        company = await Company.create({
          name: lead.companyName,
          phone: lead.phone,
          organizationId: req.user.organizationId,
          ownerId: req.user._id
        });
      }
    }

    const contact = await Contact.create({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      companyId: company ? company._id : null,
      organizationId: req.user.organizationId,
      ownerId: req.user._id
    });

    const deal = await Deal.create({
      title: `${lead.name} - ${lead.companyName || 'Deal'}`,
      contactId: contact._id,
      companyId: company ? company._id : null,
      value: req.body.dealValue || 0,
      ownerId: req.user._id,
      organizationId: req.user.organizationId,
      leadId: lead._id
    });

    lead.status = 'Converted';
    lead.convertedTo = {
      contactId: contact._id,
      companyId: company ? company._id : null,
      dealId: deal._id
    };
    await lead.save();

    await Activity.create({
      relatedEntityType: 'Lead',
      relatedEntityId: lead._id,
      type: 'note',
      description: 'Lead converted to contact, company, and deal',
      userId: req.user._id,
      organizationId: req.user.organizationId
    });

    res.status(200).json({
      success: true,
      data: { lead, contact, company, deal }
    });
  } catch (error) {
    console.error('Convert lead error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
