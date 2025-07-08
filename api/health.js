// api/health.cjs

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({
    status: "healthy",
    network: "mainnet-beta",
    timestamp: new Date().toISOString(),
    message: "Bridge server is working!"
  });
};
