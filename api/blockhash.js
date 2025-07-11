export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  try {
    // Fix Buffer issues in serverless environment
    if (typeof global.Buffer === "undefined") {
      global.Buffer = require("buffer").Buffer
    }

    const { Connection, clusterApiUrl } = await import("@solana/web3.js")

    // Environment variables
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    console.log("🔄 Getting latest blockhash...")
    const { blockhash } = await connection.getLatestBlockhash("confirmed")

    console.log("✅ Latest blockhash:", blockhash)

    res.json({
      success: true,
      blockhash: blockhash,
      network: SOLANA_NETWORK,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("❌ Blockhash error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
