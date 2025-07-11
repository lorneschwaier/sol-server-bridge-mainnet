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

  try {
    // Fix Buffer issues in serverless environment
    if (typeof global.Buffer === "undefined") {
      global.Buffer = require("buffer").Buffer
    }

    const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = await import("@solana/web3.js")
    const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults")
    const { mplCore } = await import("@metaplex-foundation/mpl-core")
    const { keypairIdentity } = await import("@metaplex-foundation/umi")
    const { fromWeb3JsKeypair } = await import("@metaplex-foundation/umi-web3js-adapters")

    // Environment variables
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    let creatorKeypair = null
    let creatorUmi = null
    let balance = 0

    if (process.env.CREATOR_PRIVATE_KEY) {
      try {
        // Parse private key with proper Buffer handling
        let privateKeyArray
        if (process.env.CREATOR_PRIVATE_KEY.startsWith("[")) {
          privateKeyArray = JSON.parse(process.env.CREATOR_PRIVATE_KEY)
        } else {
          const bs58 = await import("bs58")
          const decoded = bs58.default.decode(process.env.CREATOR_PRIVATE_KEY)
          privateKeyArray = Array.from(decoded)
        }

        creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
        balance = await connection.getBalance(creatorKeypair.publicKey)

        // Initialize UMI
        const umi = createUmi(SOLANA_RPC_URL).use(mplCore())
        const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
        creatorUmi = umi.use(keypairIdentity(umiKeypair))
      } catch (error) {
        console.error("❌ Error loading creator keypair:", error.message)
      }
    }

    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      network: SOLANA_NETWORK,
      rpcUrl: SOLANA_RPC_URL,
      host: process.env.VERCEL_URL || "localhost",
      port: process.env.PORT || 3000,
      mode: creatorUmi ? "real_minting_core" : "simulation",
      environment: {
        pinataConfigured: !!(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY),
        creatorKeyConfigured: !!process.env.CREATOR_PRIVATE_KEY,
        creatorWalletLoaded: !!creatorKeypair,
        metaplexCoreReady: !!creatorUmi,
        creatorWallet: creatorKeypair ? creatorKeypair.publicKey.toString() : null,
        balance: creatorKeypair ? balance / LAMPORTS_PER_SOL : 0,
      },
    })
  } catch (error) {
    console.error("❌ Health check error:", error)
    res.status(500).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
}
