const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    industry: { type: String },
    currency: { type: String, default: 'USD' },
    timezone: { type: String, default: 'UTC' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    leadSources: [{ type: String }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('Organization', organizationSchema);
