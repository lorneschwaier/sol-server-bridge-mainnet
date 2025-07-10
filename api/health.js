export default function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    message: "Solana NFT Bridge is running",
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      solanaNetwork: process.env.SOLANA_NETWORK || "mainnet-beta",
      pinataConfigured: !!(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY),
      creatorKeyConfigured: !!process.env.CREATOR_PRIVATE_KEY,
    },
  })
}
