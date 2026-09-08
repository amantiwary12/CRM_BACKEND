const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    source: {
      type: String,
      enum: ['Website', 'Referral', 'LinkedIn', 'Advertisement', 'Cold Outreach', 'Event', 'Manual', 'Other'],
      default: 'Manual',
    },
    status: {
      type: String,
      enum: ['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted'],
      default: 'New',
    },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    estimatedBudget: { type: Number },
    nextFollowUpAt: { type: Date },
    serviceInterest: { type: String },
    notes: { type: String },
    convertedTo: {
      contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
      companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
      dealId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
    },
  },
  { timestamps: true }
);

leadSchema.index({ organizationId: 1, status: 1 });
leadSchema.index({ organizationId: 1, ownerId: 1 });

module.exports = mongoose.model('Lead', leadSchema);
