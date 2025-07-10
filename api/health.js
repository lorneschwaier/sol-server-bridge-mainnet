const { Connection, PublicKey, Keypair, clusterApiUrl } = require("@solana/web3.js")
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults")
const { mplCore } = require("@metaplex-foundation/mpl-core")
const { keypairIdentity } = require("@metaplex-foundation/umi")
const { fromWeb3JsKeypair } = require("@metaplex-foundation/umi-web3js-adapters")
const bs58 = require("bs58")

// Environment variables
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ||
  (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))
const PINATA_API_KEY = process.env.PINATA_API_KEY
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY

// Initialize Solana connection
const connection = new Connection(SOLANA_RPC_URL, "confirmed")

// Initialize creator keypair and UMI
let creatorKeypair = null
let creatorUmi = null

if (CREATOR_PRIVATE_KEY) {
  try {
    console.log("🔑 Loading creator wallet...")

    // Parse private key (handle both JSON array and base58 formats)
    let privateKeyArray
    if (CREATOR_PRIVATE_KEY.startsWith("[")) {
      privateKeyArray = JSON.parse(CREATOR_PRIVATE_KEY)
    } else {
      privateKeyArray = Array.from(bs58.decode(CREATOR_PRIVATE_KEY))
    }

    // Create Web3.js keypair
    creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString())

    // Initialize UMI with Metaplex Core
    const umi = createUmi(SOLANA_RPC_URL).use(mplCore())

    // Convert Web3.js keypair to UMI keypair
    const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
    creatorUmi = umi.use(keypairIdentity(umiKeypair))

    console.log("⚡ Metaplex Core UMI initialized successfully")
  } catch (error) {
    console.error("❌ Error loading creator keypair:", error.message)
  }
} else {
  console.warn("⚠️ CREATOR_PRIVATE_KEY not provided - running in simulation mode")
}

export default function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  res.status(200).json({
    status: "healthy",
    message: "Solana NFT Bridge Server is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    network: SOLANA_NETWORK,
    rpcUrl: SOLANA_RPC_URL,
    mode: creatorUmi ? "real_minting_core" : "simulation",
    environment: {
      pinataConfigured: !!(PINATA_API_KEY && PINATA_SECRET_KEY),
      creatorKeyConfigured: !!CREATOR_PRIVATE_KEY,
      creatorWalletLoaded: !!creatorKeypair,
      metaplexCoreReady: !!creatorUmi,
    },
  })
}
