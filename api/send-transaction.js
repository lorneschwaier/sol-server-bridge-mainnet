import { Connection } from "@solana/web3.js"

const MAINNET_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  console.log("💸 /api/send-transaction route hit")

  try {
    const { signedTransaction } = req.body

    if (!signedTransaction) {
      return res.status(400).json({
        success: false,
        error: "Missing signedTransaction",
      })
    }

    const connection = new Connection(MAINNET_RPC_URL, "confirmed")
    const rawTransaction = Buffer.from(signedTransaction, "base64")
    const signature = await connection.sendRawTransaction(rawTransaction)
    await connection.confirmTransaction(signature, "finalized")

    console.log("✅ Transaction sent successfully:", signature)

    return res.status(200).json({
      success: true,
      signature: signature,
    })
  } catch (error) {
    console.error("❌ Error in /api/send-transaction:", error)
    return res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
