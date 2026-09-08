const jwt = require('jsonwebtoken');

const generateToken = (userId, orgId, role) => {
  return jwt.sign(
    { userId, orgId, role },
    process.env.JWT_SECRET_KEY,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

const paginate = (query, { page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  return query.skip(skip).limit(Number(limit));
};

const buildFilter = (filters) => {
  const filter = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value === 'string' && value.includes(',')) {
        filter[key] = { $in: value.split(',') };
      } else {
        filter[key] = value;
      }
    }
  }
  return filter;
};

const buildSearch = (fields, term) => {
  if (!term) return {};
  return {
    $or: fields.map((field) => ({
      [field]: { $regex: term, $options: 'i' },
    })),
  };
};

// Caps a client-supplied ?limit= so a single request can't force an
// unbounded collection scan/response (e.g. ?limit=999999999).
const clampLimit = (rawLimit, { max = 100, fallback = 20 } = {}) => {
  const parsed = parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

module.exports = { generateToken, paginate, buildFilter, buildSearch, clampLimit };
