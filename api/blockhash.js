export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  try {
    const { Connection, clusterApiUrl } = await import("@solana/web3.js")

    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")
    const { blockhash } = await connection.getLatestBlockhash()

    res.status(200).json({
      success: true,
      blockhash: blockhash,
      network: SOLANA_NETWORK,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Blockhash error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
