const { Connection } = require("@solana/web3.js")

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
}

module.exports = async (req, res) => {
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).json({ message: "OK" })
  }

  // Set CORS headers
  Object.keys(corsHeaders).forEach((key) => {
    res.setHeader(key, corsHeaders[key])
  })

  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    const connection = new Connection(rpcUrl, "confirmed")

    // Get current slot to verify connection
    const slot = await connection.getSlot()

    // Check environment variables
    const requiredVars = ["CREATOR_PRIVATE_KEY"]
    const optionalVars = ["SOLANA_RPC_URL", "PINATA_API_KEY", "PINATA_SECRET_KEY"]

    const envCheck = {
      required: requiredVars.every((varName) => process.env[varName]),
      optional: optionalVars.filter((varName) => process.env[varName]).length,
    }

    return res.status(200).json({
      success: true,
      status: "healthy",
      network: "mainnet-beta",
      timestamp: new Date().toISOString(),
      message: "Bridge server is working!",
      solana_slot: slot,
      creator_wallet: process.env.CREATOR_WALLET || "Not configured",
      environment_check: envCheck.required ? "passed" : "failed",
      required_vars: envCheck.required ? "✅ All required variables present" : "❌ Missing required variables",
      optional_vars: `✅ ${envCheck.optional}/${optionalVars.length} optional variables present`,
      rpc_url: rpcUrl,
      final_fix_applied: "July 9, 2025 - CORS and endpoints corrected",
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
