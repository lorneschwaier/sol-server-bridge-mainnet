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
    const { Connection, clusterApiUrl } = await import("@solana/web3.js")

    const { serializedTransaction } = req.body

    if (!serializedTransaction) {
      return res.status(400).json({
        success: false,
        error: "Missing serializedTransaction",
      })
    }

    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    // Deserialize and send transaction
    const transaction = Buffer.from(serializedTransaction, "base64")
    const signature = await connection.sendRawTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, "confirmed")

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    res.status(200).json({
      success: true,
      signature: signature,
      message: "Transaction sent successfully",
    })
  } catch (error) {
    console.error("Send transaction error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
