export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    })
  }

  try {
    const { Connection, Transaction } = require("@solana/web3.js")

    const { signedTx } = req.body

    if (!signedTx) {
      return res.status(400).json({
        success: false,
        error: "Missing signed transaction",
      })
    }

    // Create connection to Solana
    const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed")

    // Deserialize the signed transaction
    const transaction = Transaction.from(Buffer.from(signedTx, "base64"))

    console.log("📡 Broadcasting transaction to Solana...")

    // Send the transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })

    console.log("✅ Transaction sent! Signature:", signature)

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, "confirmed")

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    console.log("✅ Transaction confirmed!")

    return res.status(200).json({
      success: true,
      signature: signature,
      confirmation: confirmation,
    })
  } catch (error) {
    console.error("❌ Send transaction error:", error)

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send transaction",
    })
  }
}
