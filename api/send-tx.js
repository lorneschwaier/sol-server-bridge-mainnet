import { Connection, Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js"

const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
}

export default async function handler(req, res) {
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).json({ message: "OK" })
  }

  // Set CORS headers
  Object.keys(corsHeaders).forEach((key) => {
    res.setHeader(key, corsHeaders[key])
  })

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" })
  }

  try {
    const { fromPubkey, toPubkey, amount } = req.body

    console.log("💰 Creating payment transaction...")
    console.log("From:", fromPubkey)
    console.log("To:", toPubkey)
    console.log("Amount:", amount, "SOL")

    if (!fromPubkey || !toPubkey || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: fromPubkey, toPubkey, amount",
      })
    }

    // Use environment RPC URL or default to mainnet
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    const connection = new Connection(rpcUrl, "confirmed")

    // Convert amount to lamports
    const lamports = Math.floor(Number.parseFloat(amount) * LAMPORTS_PER_SOL)

    // Create transaction
    const transaction = new Transaction()

    // Add transfer instruction
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(fromPubkey),
        toPubkey: new PublicKey(toPubkey),
        lamports: lamports,
      }),
    )

    // Get latest blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed")
    transaction.recentBlockhash = blockhash
    transaction.feePayer = new PublicKey(fromPubkey)

    // Serialize transaction for signing
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })

    console.log("✅ Transaction created successfully")

    return res.status(200).json({
      success: true,
      transaction: serializedTransaction.toString("base64"),
      blockhash: blockhash,
      lastValidBlockHeight: lastValidBlockHeight,
      message: "Transaction ready for signing",
    })
  } catch (error) {
    console.error("❌ Send transaction error:", error)

    return res.status(500).json({
      success: false,
      error: "Failed to create transaction",
      details: error.message,
    })
  }
}
