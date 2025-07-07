import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js"

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

  console.log("💰 /api/prepare-transaction route hit")

  try {
    const { fromAddress, toAddress, amountSOL } = req.body

    if (!fromAddress || !toAddress || !amountSOL) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      })
    }

    const connection = new Connection(MAINNET_RPC_URL, "confirmed")
    const fromPubkey = new PublicKey(fromAddress)
    const toPubkey = new PublicKey(toAddress)
    const lamports = Math.floor(amountSOL * LAMPORTS_PER_SOL)

    const { blockhash } = await connection.getLatestBlockhash("finalized")

    const transaction = new Transaction({
      feePayer: fromPubkey,
      recentBlockhash: blockhash,
    }).add(
      SystemProgram.transfer({
        fromPubkey: fromPubkey,
        toPubkey: toPubkey,
        lamports: lamports,
      }),
    )

    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })

    console.log("✅ Transaction prepared successfully")

    return res.status(200).json({
      success: true,
      transaction: serializedTransaction.toString("base64"),
    })
  } catch (error) {
    console.error("❌ Error in /api/prepare-transaction:", error)
    return res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
