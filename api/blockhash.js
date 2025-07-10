const { Connection, clusterApiUrl } = require("@solana/web3.js")

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

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
      method: req.method,
    })
  }

  try {
    console.log("🔗 Getting latest blockhash...")

    // Use environment RPC URL or default to mainnet
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    const connection = new Connection(rpcUrl, "confirmed")

    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")

    console.log("✅ Blockhash retrieved:", blockhash)

    return res.status(200).json({
      success: true,
      blockhash: blockhash,
      lastValidBlockHeight: lastValidBlockHeight,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("❌ Blockhash error:", error)

    return res.status(500).json({
      success: false,
      error: "Failed to get blockhash",
      details: error.message,
      timestamp: new Date().toISOString(),
    })
  }
}
