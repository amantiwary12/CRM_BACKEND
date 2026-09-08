const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    relatedEntityType: { type: String, enum: ['Lead', 'Contact', 'Company', 'Deal'] },
    relatedEntityId: { type: mongoose.Schema.Types.ObjectId },
    dueAt: { type: Date },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['open', 'in_progress', 'completed', 'cancelled'], default: 'open' },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

taskSchema.index({ organizationId: 1, status: 1 });
taskSchema.index({ organizationId: 1, assigneeId: 1 });
taskSchema.index({ organizationId: 1, dueAt: 1 });

module.exports = mongoose.model('Task', taskSchema);
