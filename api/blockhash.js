export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  try {
    const { Connection } = await import("@solana/web3.js")
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()

    res.status(200).json({
      success: true,
      blockhash,
      lastValidBlockHeight,
      network: process.env.SOLANA_NETWORK || "mainnet-beta",
    })
  } catch (error) {
    console.error("Blockhash error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
