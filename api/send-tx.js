export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

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
        error: "Missing signedTx parameter",
      })
    }

    const { Connection, Transaction } = await import("@solana/web3.js")

    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    // Deserialize the transaction
    const transaction = Transaction.from(Buffer.from(signedTx, "base64"))

    // Send the transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })

    // Wait for confirmation
    await connection.confirmTransaction(signature, "confirmed")

    res.status(200).json({
      success: true,
      signature: signature,
    })
  } catch (error) {
    console.error("❌ Send transaction error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
