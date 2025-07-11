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
    // Fix Buffer issues in serverless environment
    if (typeof global.Buffer === "undefined") {
      global.Buffer = require("buffer").Buffer
    }

    const { Connection, Transaction, clusterApiUrl } = await import("@solana/web3.js")

    const { signedTx } = req.body

    if (!signedTx) {
      return res.status(400).json({
        success: false,
        error: "Missing signedTx parameter",
      })
    }

    // Environment variables
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    console.log("📡 Sending transaction to Solana...")

    // Deserialize the transaction from base64
    const transactionBuffer = Buffer.from(signedTx, "base64")
    const transaction = Transaction.from(transactionBuffer)

    // Send the transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    })

    console.log("✅ Transaction sent successfully:", signature)

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, "confirmed")

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    res.json({
      success: true,
      signature: signature,
      network: SOLANA_NETWORK,
      confirmation: confirmation.value,
    })
  } catch (error) {
    console.error("❌ Send transaction error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
