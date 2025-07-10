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
    const { signedTransaction } = req.body

    if (!signedTransaction) {
      return res.status(400).json({
        success: false,
        error: "Missing signedTransaction",
      })
    }

    // Dynamic imports
    const { Connection, Transaction, clusterApiUrl } = await import("@solana/web3.js")

    // Environment variables
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))

    console.log("📡 Sending transaction to Solana...")

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    // Deserialize and send transaction
    const transaction = Transaction.from(Buffer.from(signedTransaction, "base64"))
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })

    console.log("✅ Transaction sent:", signature)

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, "confirmed")

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    console.log("🎉 Transaction confirmed!")

    const explorerUrl = `https://explorer.solana.com/tx/${signature}${SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""}`

    res.status(200).json({
      success: true,
      signature: signature,
      explorerUrl: explorerUrl,
      network: SOLANA_NETWORK,
      message: "Transaction sent and confirmed successfully!",
    })
  } catch (error) {
    console.error("❌ Send transaction error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
