export const captureAuditInfo = (req, res, next) => {
  req.auditInfo = {
    adminIp: req.ip || req.connection.remoteAddress,
    adminUserAgent: req.get("user-agent") || "",
  };
  next();
};

