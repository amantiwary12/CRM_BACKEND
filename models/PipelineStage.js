const mongoose = require('mongoose');

const pipelineStageSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    order: { type: Number, required: true },
    probability: { type: Number, min: 0, max: 100, default: 0 },
    type: { type: String, enum: ['progress', 'closure_won', 'closure_lost'], default: 'progress' },
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pipelineStageSchema.index({ organizationId: 1, order: 1 });
pipelineStageSchema.index({ organizationId: 1, type: 1 });

module.exports = mongoose.model('PipelineStage', pipelineStageSchema);
