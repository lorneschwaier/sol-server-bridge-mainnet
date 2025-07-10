import { Connection } from "@solana/web3.js"

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  try {
    console.log("🔗 Blockhash requested")

    const connection = new Connection(RPC_URL, "confirmed")
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")

    console.log("✅ Blockhash retrieved:", blockhash)

    return res.status(200).json({
      result: {
        value: {
          blockhash,
          lastValidBlockHeight,
        },
      },
      success: true,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("❌ Blockhash error:", error)
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
}
