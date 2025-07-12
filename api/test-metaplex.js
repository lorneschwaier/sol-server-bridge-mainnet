export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  try {
    const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

    if (!CREATOR_PRIVATE_KEY) {
      return res.status(500).json({
        success: false,
        error: "CREATOR_PRIVATE_KEY not configured",
      })
    }

    // Dynamic imports
    const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults")
    const { createSignerFromKeypair, signerIdentity } = await import("@metaplex-foundation/umi")
    const { mplCore } = await import("@metaplex-foundation/mpl-core")
    const { fromWeb3JsKeypair } = await import("@metaplex-foundation/umi-web3js-adapters")
    const { Keypair, Connection, LAMPORTS_PER_SOL } = await import("@solana/web3.js")
    const bs58 = (await import("bs58")).default

    console.log("🧪 Testing Metaplex connection...")

    // Parse creator private key
    let privateKeyArray
    if (CREATOR_PRIVATE_KEY.startsWith("[")) {
      privateKeyArray = JSON.parse(CREATOR_PRIVATE_KEY)
    } else {
      privateKeyArray = Array.from(bs58.decode(CREATOR_PRIVATE_KEY))
    }

    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
    console.log("🔑 Creator wallet:", creatorKeypair.publicKey.toString())

    // Check balance
    const connection = new Connection(SOLANA_RPC_URL, "confirmed")
    const balance = await connection.getBalance(creatorKeypair.publicKey)
    console.log("💰 Wallet balance:", balance / LAMPORTS_PER_SOL, "SOL")

    // Initialize Umi
    const umi = createUmi(SOLANA_RPC_URL).use(mplCore())
    const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
    const signer = createSignerFromKeypair(umi, umiKeypair)
    umi.use(signerIdentity(signer))

    console.log("✅ Metaplex test successful!")

    res.status(200).json({
      success: true,
      message: "Metaplex connection successful!",
      creatorWallet: creatorKeypair.publicKey.toString(),
      balance: balance / LAMPORTS_PER_SOL,
      network: process.env.SOLANA_NETWORK || "mainnet-beta",
      rpcUrl: SOLANA_RPC_URL,
    })
  } catch (error) {
    console.error("❌ Metaplex test error:", error)

    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}
