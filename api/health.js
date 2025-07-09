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
    // Check environment variables with your specific variable names
    const envCheck = {
      SOLANA_NETWORK: process.env.SOLANA_NETWORK || "Not set",
      SOLANA_RPC_URL: process.env.SOLANA_RPC_URL ? "configured" : "missing",
      CREATOR_WALLET: process.env.CREATOR_WALLET ? "configured" : "missing",
      CREATOR_PRIVATE_KEY: process.env.CREATOR_PRIVATE_KEY ? "configured" : "missing",
      PINATA_API_KEY: process.env.PINATA_API_KEY ? "configured" : "missing",
      PINATA_SECRET_KEY: process.env.PINATA_SECRET_KEY ? "configured" : "missing",
      API_KEY: process.env.API_KEY ? "configured" : "missing",
    }

    // Check required environment variables
    const requiredVars = ["CREATOR_PRIVATE_KEY", "SOLANA_RPC_URL"]
    const missingRequired = requiredVars.filter((varName) => !process.env[varName])

    if (missingRequired.length > 0) {
      return res.status(500).json({
        success: false,
        error: `Missing required environment variables: ${missingRequired.join(", ")}`,
        status: "unhealthy",
        env_check: envCheck,
      })
    }

    // Test Solana connection
    const { Connection } = require("@solana/web3.js")
    const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed")

    const slot = await connection.getSlot()

    const healthData = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "Solana NFT Bridge",
      network: process.env.SOLANA_NETWORK || "mainnet-beta",
      rpc_url: process.env.SOLANA_RPC_URL ? "configured" : "missing",
      creator_wallet: process.env.CREATOR_WALLET ? "configured" : "missing",
      creator_private_key: process.env.CREATOR_PRIVATE_KEY ? "configured" : "missing",
      pinata_api_key: process.env.PINATA_API_KEY ? "configured" : "missing",
      pinata_secret_key: process.env.PINATA_SECRET_KEY ? "configured" : "missing",
      final_fix: "UMI initialization corrected - July 9, 2025",
    }

    return res.status(200).json(healthData)
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
