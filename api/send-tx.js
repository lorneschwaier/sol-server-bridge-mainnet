export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" })
  }

  try {
    const { transaction } = req.body

    if (!transaction) {
      return res.status(400).json({
        success: false,
        error: "Missing transaction data",
      })
    }

    const { Connection, Transaction } = await import("@solana/web3.js")
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    // Deserialize transaction
    const tx = Transaction.from(Buffer.from(transaction, "base64"))

    // Send transaction
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })

    // Confirm transaction
    const confirmation = await connection.confirmTransaction(signature, "confirmed")

    res.status(200).json({
      success: true,
      signature,
      confirmation,
    })
  } catch (error) {
    console.error("Send transaction error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
