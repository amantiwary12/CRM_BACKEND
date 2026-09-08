const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    type: { type: String, enum: ['call', 'meeting', 'email', 'demo', 'note'], required: true },
    relatedEntityType: { type: String, enum: ['Lead', 'Contact', 'Company', 'Deal'] },
    relatedEntityId: { type: mongoose.Schema.Types.ObjectId, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    outcome: { type: String },
    description: { type: String },
    activityAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activitySchema.index({ organizationId: 1, relatedEntityType: 1, relatedEntityId: 1 });
activitySchema.index({ organizationId: 1, userId: 1 });

module.exports = mongoose.model('Activity', activitySchema);
