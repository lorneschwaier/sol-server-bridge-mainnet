module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  try {
    console.log("🏥 Health check requested")

    // Check environment variables
    const envCheck = {
      CREATOR_PRIVATE_KEY: !!process.env.CREATOR_PRIVATE_KEY,
      CREATOR_WALLET: !!process.env.CREATOR_WALLET,
      PINATA_API_KEY: !!process.env.PINATA_API_KEY,
      PINATA_SECRET_KEY: !!process.env.PINATA_SECRET_KEY,
      SOLANA_RPC_URL: !!process.env.SOLANA_RPC_URL,
    }

    const allEnvPresent = Object.values(envCheck).every(Boolean)

    return res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      network: process.env.SOLANA_NETWORK || "mainnet-beta",
      rpc_url: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      env_variables: envCheck,
      all_env_present: allEnvPresent,
      message: allEnvPresent ? "Bridge server is ready" : "Missing environment variables",
    })
  } catch (error) {
    console.error("❌ Health check failed:", error)
    return res.status(500).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
}
