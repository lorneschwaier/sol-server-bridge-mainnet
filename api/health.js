export default async function handler(req, res) {
  if (!res || typeof res.setHeader !== "function") {
    console.log("[v0] Skipping execution in preview environment - this file is meant for Vercel deployment")
    return
  }

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
    // Environment variables
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com")

    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      network: SOLANA_NETWORK,
      rpcUrl: SOLANA_RPC_URL,
      mode: "real_minting_core",
      environment: {
        pinataConfigured: !!(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY),
        creatorKeyConfigured: !!process.env.CREATOR_PRIVATE_KEY,
        metaplexCoreReady: true,
      },
      message: "Solana NFT Bridge Server is running",
    })
  } catch (error) {
    console.error("❌ Health check error:", error)
    res.status(500).json({
      status: "error",
      error: error.message,
    })
  }
}
