module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  try {
    console.log("🏥 Health check requested")

    // Return the exact format WordPress expects
    const healthResponse = {
      success: true,
      status: "ok",
      message: "Bridge server is healthy and ready for mainnet NFT minting",
      network: process.env.SOLANA_NETWORK || "mainnet-beta",
      rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    }

    console.log("✅ Health check response:", healthResponse)

    res.status(200).json(healthResponse)
  } catch (error) {
    console.error("❌ Health check error:", error)

    res.status(500).json({
      success: false,
      status: "error",
      message: "Health check failed",
      error: error.message,
    })
  }
}
