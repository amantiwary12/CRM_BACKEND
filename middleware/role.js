const role = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const normalized = (req.user.role || '').toLowerCase();
    if (!allowedRoles.includes(normalized)) {
      return res.status(403).json({ message: 'Insufficient permissions for this action' });
    }

    next();
  };
};

module.exports = role;
module.exports.authorize = role;
