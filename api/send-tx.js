export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const { signedTx } = req.body

    if (!signedTx) {
      return res.status(400).json({
        success: false,
        error: "Missing signed transaction",
      })
    }

    // Dynamic imports
    const { Connection, clusterApiUrl, Transaction } = await import("@solana/web3.js")

    // Environment variables
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))

    // Initialize connection
    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    // Deserialize transaction
    const transaction = Transaction.from(Buffer.from(signedTx, "base64"))

    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })

    console.log("✅ Transaction sent successfully:", signature)

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, "confirmed")

    if (confirmation.value.err) {
      throw new Error("Transaction failed: " + JSON.stringify(confirmation.value.err))
    }

    res.status(200).json({
      success: true,
      signature: signature,
      network: SOLANA_NETWORK,
    })
  } catch (error) {
    console.error("❌ Send transaction error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
