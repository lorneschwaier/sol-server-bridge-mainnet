module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    })
  }

  try {
    // Check environment variables
    const requiredEnvVars = ["SOLANA_RPC_URL", "CREATOR_PRIVATE_KEY", "PINATA_API_KEY", "PINATA_SECRET_KEY"]
    const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])

    if (missingVars.length > 0) {
      return res.status(500).json({
        success: false,
        error: `Missing environment variables: ${missingVars.join(", ")}`,
        status: "unhealthy",
      })
    }

    // Test Solana connection
    const { Connection, clusterApiUrl } = require("@solana/web3.js")
    const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta"), "confirmed")

    const slot = await connection.getSlot()

    return res.status(200).json({
      success: true,
      status: "healthy",
      network: "mainnet-beta",
      timestamp: new Date().toISOString(),
      message: "Bridge server is working!",
      solana_slot: slot,
      environment_check: "passed",
    })
  } catch (error) {
    console.error("❌ Health check failed:", error)
    return res.status(500).json({
      success: false,
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
}
