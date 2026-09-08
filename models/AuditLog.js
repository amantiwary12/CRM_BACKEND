const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: false, updatedAt: false } }
);

auditLogSchema.index({ organizationId: 1, entityType: 1, entityId: 1 });
auditLogSchema.index({ organizationId: 1, actorId: 1 });
auditLogSchema.index({ organizationId: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
