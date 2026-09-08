const express = require('express');
const router = express.Router();
const Company = require('../models/Company');
const Contact = require('../models/Contact');
const Deal = require('../models/Deal');
const Activity = require('../models/Activity');
const { protect } = require('../middleware/auth');
const { clampLimit } = require('../utils/helpers');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const {
      search, page = 1, sort = '-createdAt'
    } = req.query;
    const limit = clampLimit(req.query.limit);

    const filter = { organizationId: req.user.organizationId };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { industry: { $regex: search, $options: 'i' } },
        { website: { $regex: search, $options: 'i' } }
      ];
    }

    const [total, companies] = await Promise.all([
      Company.countDocuments(filter),
      Company.find(filter)
        .populate('ownerId', 'name email')
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const companyIds = companies.map((c) => c._id);
    const [contactCounts, dealStats] = await Promise.all([
      Contact.aggregate([
        { $match: { organizationId: req.user.organizationId, companyId: { $in: companyIds } } },
        { $group: { _id: '$companyId', count: { $sum: 1 } } },
      ]),
      Deal.aggregate([
        { $match: { organizationId: req.user.organizationId, companyId: { $in: companyIds } } },
        { $group: { _id: '$companyId', count: { $sum: 1 }, totalValue: { $sum: '$value' } } },
      ]),
    ]);
    const contactMap = Object.fromEntries(contactCounts.map((c) => [c._id.toString(), c.count]));
    const dealMap = Object.fromEntries(dealStats.map((d) => [d._id.toString(), d]));
    const enriched = companies.map((c) => ({
      ...c,
      contacts: contactMap[c._id.toString()] || 0,
      deals: dealMap[c._id.toString()]?.count || 0,
      totalDealValue: dealMap[c._id.toString()]?.totalValue || 0,
    }));

    res.status(200).json({
      success: true,
      data: {
        companies: enriched,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const company = await Company.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    }).populate('ownerId', 'name email');

    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const contacts = await Contact.find({
      companyId: company._id,
      organizationId: req.user.organizationId
    });

    const deals = await Deal.find({
      companyId: company._id,
      organizationId: req.user.organizationId
    }).sort('-createdAt');

    const totalDealValue = deals.reduce((sum, deal) => sum + (deal.value || 0), 0);

    const activities = await Activity.find({
      relatedEntityType: 'Company',
      relatedEntityId: company._id,
      organizationId: req.user.organizationId
    }).sort('-activityAt').limit(10);

    res.status(200).json({
      success: true,
      data: { company, contacts, deals, totalDealValue, activities }
    });
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const companyData = {
      ...req.body,
      organizationId: req.user.organizationId,
      ownerId: req.body.ownerId || req.user._id
    };

    const company = await Company.create(companyData);

    res.status(201).json({ success: true, data: company });
  } catch (error) {
    console.error('Create company error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    let company = await Company.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    company = await Company.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({ success: true, data: company });
  } catch (error) {
    console.error('Update company error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const company = await Company.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    await company.deleteOne();

    res.status(200).json({ success: true, data: { message: 'Company deleted successfully' } });
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    const company = await Company.findOne({
      _id: req.params.id,
      organizationId: req.user.organizationId
    });

    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    res.status(200).json({ success: true, data: company });
  } catch (error) {
    console.error('Restore company error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
