const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    jobTitle: { type: String, trim: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
);

contactSchema.index({ organizationId: 1, email: 1 });
contactSchema.index({ organizationId: 1, companyId: 1 });

module.exports = mongoose.model('Contact', contactSchema);
