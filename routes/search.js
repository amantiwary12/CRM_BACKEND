const express = require('express');
const router = express.Router();
const Lead = require('../models/Lead');
const Contact = require('../models/Contact');
const Company = require('../models/Company');
const Deal = require('../models/Deal');
const { protect } = require('../middleware/auth');
const { clampLimit } = require('../utils/helpers');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const orgId = req.user.organizationId;
    const searchRegex = { $regex: q, $options: 'i' };
    const limitNum = clampLimit(limit, { max: 50, fallback: 10 });

    // The four collections are unrelated, so search them concurrently instead
    // of paying for four sequential round trips.
    const [leads, contacts, companies, deals] = await Promise.all([
      Lead.find({
        organizationId: orgId,
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
          { companyName: searchRegex }
        ]
      })
        .select('name email phone companyName status source')
        .limit(limitNum)
        .lean(),

      Contact.find({
        organizationId: orgId,
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { phone: searchRegex }
        ]
      })
        .select('name email phone jobTitle')
        .populate('companyId', 'name')
        .limit(limitNum)
        .lean(),

      Company.find({
        organizationId: orgId,
        $or: [
          { name: searchRegex },
          { industry: searchRegex },
          { website: searchRegex }
        ]
      })
        .select('name industry website phone')
        .limit(limitNum)
        .lean(),

      Deal.find({
        organizationId: orgId,
        $or: [
          { title: searchRegex },
          { description: searchRegex }
        ]
      })
        .select('title value status stageId')
        .populate('contactId', 'name email')
        .populate('companyId', 'name')
        .populate('stageId', 'name')
        .limit(limitNum)
        .lean(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        leads,
        contacts,
        companies,
        deals,
        totalResults: leads.length + contacts.length + companies.length + deals.length
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
