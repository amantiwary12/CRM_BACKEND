const tenant = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }

  if (!req.user.organizationId) {
    return res.status(400).json({ message: 'No organization associated with this user' });
  }

  req.orgId = req.user.organizationId;
  next();
};

module.exports = tenant;
