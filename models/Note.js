const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    relatedEntityType: { type: String, enum: ['Lead', 'Contact', 'Company', 'Deal'] },
    relatedEntityId: { type: mongoose.Schema.Types.ObjectId, index: true },
    content: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

noteSchema.index({ organizationId: 1, relatedEntityType: 1, relatedEntityId: 1 });

module.exports = mongoose.model('Note', noteSchema);
