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
    // Dynamic import
    const { Connection, clusterApiUrl } = await import("@solana/web3.js")

    // Environment variables
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))

    // Initialize connection
    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    // Get latest blockhash
    const { blockhash } = await connection.getLatestBlockhash("confirmed")

    console.log("✅ Latest blockhash:", blockhash)

    res.status(200).json({
      success: true,
      blockhash: blockhash,
      network: SOLANA_NETWORK,
    })
  } catch (error) {
    console.error("❌ Blockhash error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
