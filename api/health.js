const MAINNET_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }

  return res.status(200).json({
    status: "🔥 Mainnet Bridge is ALIVE",
    network: "mainnet-beta",
    rpc: MAINNET_RPC_URL,
    timestamp: new Date().toISOString(),
  })
}
