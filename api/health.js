export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  try {
    const healthData = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "production",
      network: process.env.SOLANA_NETWORK || "mainnet-beta",
      rpc: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
      hasCreatorKey: !!process.env.CREATOR_PRIVATE_KEY,
      hasPinataKeys: !!(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY),
    }

    res.status(200).json(healthData)
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
}
