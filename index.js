const express = require("express")
const cors = require("cors")
const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = require("@solana/web3.js")
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults")
const { createV1, mplCore } = require("@metaplex-foundation/mpl-core")
const { keypairIdentity, generateSigner, publicKey, some, none } = require("@metaplex-foundation/umi")
const { fromWeb3JsKeypair } = require("@metaplex-foundation/umi-web3js-adapters")
const axios = require("axios")
const bs58 = require("bs58")

const app = express()
const PORT = process.env.PORT || 3000

// CORS configuration - Allow all origins for now
app.use(cors())

// Middleware
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

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

// Import API handlers
const healthHandler = require("./api/health.js")
const blockhashHandler = require("./api/blockhash.js")
const sendTxHandler = require("./api/send-tx.js")
const mintNftHandler = require("./api/mint-nft.js")
const testPinataHandler = require("./api/test-pinata.js")
const testMetaplexHandler = require("./api/test-metaplex.js")

// Convert Vercel handlers to Express middleware
const wrapHandler = (handler) => (req, res) => {
  handler.default(req, res)
}

// Routes
app.get("/", wrapHandler(healthHandler))
app.get("/health", wrapHandler(healthHandler))
app.get("/api/health", wrapHandler(healthHandler))
app.get("/api/blockhash", wrapHandler(blockhashHandler))
app.post("/api/send-tx", wrapHandler(sendTxHandler))
app.post("/api/mint-nft", wrapHandler(mintNftHandler))
app.get("/api/test-pinata", wrapHandler(testPinataHandler))
app.get("/api/test-metaplex", wrapHandler(testMetaplexHandler))

// Start server (for local development)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Solana Bridge Server running on port ${PORT}`)
    console.log(`📡 Network: ${process.env.SOLANA_NETWORK || "mainnet-beta"}`)
    console.log(`🔗 RPC URL: ${process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"}`)
    console.log(
      `📌 Pinata: ${process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY ? "✅ Configured" : "❌ Not configured"}`,
    )
    console.log(`🔑 Creator Wallet: ${process.env.CREATOR_PRIVATE_KEY ? "✅ Loaded" : "❌ Not loaded"}`)
  })
}

module.exports = app
