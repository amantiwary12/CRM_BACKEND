const mongoose = require('mongoose');

const dealSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    title: { type: String, required: true, trim: true },
    value: { type: Number, default: 0 },
    stageId: { type: mongoose.Schema.Types.ObjectId, ref: 'PipelineStage' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expectedCloseDate: { type: Date },
    probability: { type: Number, min: 0, max: 100, default: 0 },
    description: { type: String },
    status: { type: String, enum: ['open', 'closed_won', 'closed_lost'], default: 'open' },
    lostReason: { type: String },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

dealSchema.index({ organizationId: 1, status: 1 });
dealSchema.index({ organizationId: 1, stageId: 1 });
dealSchema.index({ organizationId: 1, ownerId: 1 });

module.exports = mongoose.model('Deal', dealSchema);
