export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  try {
    const healthData = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      version: "1.0.0",
      services: {
        pinata: !!(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY),
        solana: !!process.env.CREATOR_PRIVATE_KEY,
        rpc: process.env.SOLANA_RPC_URL || "default",
      },
    }

    res.status(200).json(healthData)
  } catch (error) {
    console.error("Health check error:", error)
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
}
