// Fix Buffer issues in serverless environment
if (typeof global.Buffer === "undefined") {
  global.Buffer = require("buffer").Buffer
}

const { Connection, Transaction } = require("@solana/web3.js")

// Environment variables
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.status(200).json({ success: true })
    return
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    // FIXED: Accept both field names for backward compatibility
    const { signedTx, transaction } = req.body
    const txB64 = transaction || signedTx

    if (!txB64) {
      console.error("Missing transaction data. Received body:", req.body)
      return res.status(400).json({
        success: false,
        error: "Missing transaction data. Expected 'transaction' or 'signedTx' field.",
      })
    }

    console.log("Received transaction data, length:", txB64.length)

    // Create connection
    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    // Deserialize transaction
    const tx = Transaction.from(Buffer.from(txB64, "base64"))
    console.log("Transaction deserialized successfully")

    // Send transaction
    console.log("Sending transaction to Solana network...")
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })

    console.log("Transaction sent successfully! Signature:", signature)

    // Wait for confirmation
    console.log("Waiting for confirmation...")
    const confirmation = await connection.confirmTransaction(signature, "confirmed")

    if (confirmation.value.err) {
      console.error("Transaction failed:", confirmation.value.err)
      return res.status(400).json({
        success: false,
        error: "Transaction failed on blockchain",
        details: confirmation.value.err,
      })
    }

    console.log("Transaction confirmed successfully!")

    res.status(200).json({
      success: true,
      signature: signature,
      confirmation: confirmation.value,
    })
  } catch (error) {
    console.error("Send transaction error:", error)

    // Handle specific error types
    if (error.message.includes("Transaction simulation failed")) {
      return res.status(400).json({
        success: false,
        error: "Transaction simulation failed - insufficient funds or invalid transaction",
        details: error.message,
      })
    }

    if (error.message.includes("Blockhash not found")) {
      return res.status(400).json({
        success: false,
        error: "Blockhash expired, please try again",
        details: error.message,
      })
    }

    res.status(500).json({
      success: false,
      error: "Failed to send transaction",
      details: error.message,
    })
  }
}
