import { Connection, Transaction } from "@solana/web3.js"

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" })
  }

  try {
    // Accept both 'transaction' and 'signedTx' field names for backward compatibility
    const { signedTx, transaction: txData } = req.body
    const txB64 = txData || signedTx

    if (!txB64) {
      return res.status(400).json({
        success: false,
        error: 'Missing transaction data. Expected either "transaction" or "signedTx" field.',
      })
    }

    console.log("Received transaction data:", txB64.substring(0, 50) + "...")

    // Initialize connection
    const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed")

    // Deserialize the transaction
    const deserializedTransaction = Transaction.from(Buffer.from(txB64, "base64"))

    console.log("Transaction deserialized successfully")

    // Send the transaction
    const signature = await connection.sendRawTransaction(deserializedTransaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })

    console.log("Transaction sent with signature:", signature)

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, "confirmed")

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    console.log("Transaction confirmed successfully")

    return res.status(200).json({
      success: true,
      signature: signature,
      message: "Transaction sent and confirmed successfully",
    })
  } catch (error) {
    console.error("Bridge server error:", error)

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}
