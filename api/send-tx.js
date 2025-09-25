export default async function handler(req, res) {
  if (!res || typeof res.setHeader !== "function") {
    console.log("[v0] Skipping execution in preview environment - this file is meant for Vercel deployment")
    return
  }

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

    console.log("[v0] Processing signed transaction...")
    console.log("[v0] Signed transaction length:", signedTx.length)

    // Dynamic imports
    const { Connection, clusterApiUrl, Transaction } = await import("@solana/web3.js")

    // Environment variables
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))

    console.log("[v0] Using network:", SOLANA_NETWORK)
    console.log("[v0] Using RPC URL:", SOLANA_RPC_URL)

    // Initialize connection
    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    console.log("[v0] Deserializing transaction...")
    const transaction = Transaction.from(Buffer.from(signedTx, "base64"))
    console.log("[v0] Transaction deserialized successfully")
    console.log("[v0] Transaction signatures:", transaction.signatures.length)

    console.log("[v0] Simulating transaction...")
    try {
      const simulation = await connection.simulateTransaction(transaction)
      console.log("[v0] Simulation result:", simulation)

      if (simulation.value.err) {
        console.error("[v0] Simulation failed:", simulation.value.err)
        throw new Error("Transaction simulation failed: " + JSON.stringify(simulation.value.err))
      }
    } catch (simError) {
      console.error("[v0] Simulation error:", simError.message)
      throw new Error("Transaction simulation failed: " + simError.message)
    }

    // Send transaction
    console.log("[v0] Sending transaction to network...")
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
