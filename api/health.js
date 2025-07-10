export default function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const healthData = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "Solana NFT Bridge",
      version: "1.0.0",
      environment: process.env.NODE_ENV || "development",
    }

    res.status(200).json(healthData)
  } catch (error) {
    console.error("Health check error:", error)
    res.status(500).json({
      error: "Health check failed",
      message: error.message,
    })
  }
}
