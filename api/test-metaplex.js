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

    if (!process.env.CREATOR_PRIVATE_KEY) {
      return res.json({
        success: false,
        error: "Creator private key not configured",
        configured: false,
      })
    }

    // Environment variables
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    // Parse private key with proper Buffer handling
    let privateKeyArray
    try {
      if (process.env.CREATOR_PRIVATE_KEY.startsWith("[")) {
        privateKeyArray = JSON.parse(process.env.CREATOR_PRIVATE_KEY)
      } else {
        const bs58 = await import("bs58")
        const decoded = bs58.default.decode(process.env.CREATOR_PRIVATE_KEY)
        privateKeyArray = Array.from(decoded)
      }
    } catch (error) {
      return res.json({
        success: false,
        error: "Invalid CREATOR_PRIVATE_KEY format: " + error.message,
        configured: true,
      })
    }

    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
    const balance = await connection.getBalance(creatorKeypair.publicKey)

    // Initialize UMI
    const umi = createUmi(SOLANA_RPC_URL).use(mplCore())
    const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
    const creatorUmi = umi.use(keypairIdentity(umiKeypair))

    res.json({
      success: true,
      configured: true,
      creatorWallet: creatorKeypair.publicKey.toString(),
      balance: balance / LAMPORTS_PER_SOL,
      network: SOLANA_NETWORK,
      rpcUrl: SOLANA_RPC_URL,
      metaplexCoreReady: true,
      version: "Metaplex Core v1.1.1",
      message:
        balance < 0.01 * LAMPORTS_PER_SOL
          ? "⚠️ Low balance - please fund wallet"
          : "✅ Ready for real NFT minting with Metaplex Core",
    })
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      configured: !!process.env.CREATOR_PRIVATE_KEY,
    })
  }
}
