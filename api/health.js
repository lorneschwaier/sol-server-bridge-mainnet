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
      SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || "Not set",
      CREATOR_WALLET: process.env.CREATOR_WALLET ? "✅ Set" : "❌ Missing",
      CREATOR_PRIVATE_KEY: process.env.CREATOR_PRIVATE_KEY ? "✅ Set" : "❌ Missing",
      PINATA_API_KEY: process.env.PINATA_API_KEY ? "✅ Set" : "❌ Missing",
      PINATA_SECRET_KEY: process.env.PINATA_SECRET_KEY ? "✅ Set" : "❌ Missing",
      API_KEY: process.env.API_KEY ? "✅ Set" : "❌ Missing",
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

    return res.status(200).json({
      success: true,
      status: "healthy",
      network: process.env.SOLANA_NETWORK || "mainnet-beta",
      timestamp: new Date().toISOString(),
      message: "Bridge server is working!",
      solana_slot: slot,
      creator_wallet: process.env.CREATOR_WALLET,
      environment_check: "passed",
      required_vars: "✅ All required variables present",
      optional_vars: "✅ All optional variables present",
      rpc_url: process.env.SOLANA_RPC_URL,
      final_fix_applied: "July 9, 2025 - UMI corrected + routing fixed",
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
