export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    })
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

    console.log("📡 Sending transaction to Solana...")

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    // Deserialize the transaction to update blockhash
    const transaction = Transaction.from(Buffer.from(signedTx, "base64"))

    // Get fresh blockhash right before sending
    console.log("🔄 Getting fresh blockhash before sending...")
    const { blockhash } = await connection.getLatestBlockhash("confirmed")

    // Update the transaction with fresh blockhash
    transaction.recentBlockhash = blockhash

    console.log("✅ Updated transaction with fresh blockhash:", blockhash)

    // Send the transaction with updated blockhash
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    })

    console.log("✅ Transaction sent:", signature)

    // Wait for confirmation with timeout
    const confirmationPromise = connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight,
      },
      "confirmed",
    )

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Confirmation timeout")), 30000),
    )

    const confirmation = await Promise.race([confirmationPromise, timeoutPromise])

    if (confirmation.value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    console.log("✅ Transaction confirmed:", signature)

    res.status(200).json({
      success: true,
      signature: signature,
      confirmation: confirmation.value,
      network: SOLANA_NETWORK,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("❌ Send transaction error:", error)

    let errorMessage = error.message || "Unknown error"

    // Handle specific error types
    if (errorMessage.includes("Blockhash not found")) {
      errorMessage = "Transaction failed: Blockhash expired. Please try again."
    } else if (errorMessage.includes("insufficient funds")) {
      errorMessage = "Transaction failed: Insufficient SOL balance."
    } else if (errorMessage.includes("Simulation failed")) {
      errorMessage = `Transaction failed: Simulation failed. ${error.message}`
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
    })
  }
}
