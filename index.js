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

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "Solana NFT Bridge Server",
    status: "running",
    timestamp: new Date().toISOString(),
  })
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    message: "Solana NFT Bridge is running",
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      solanaNetwork: SOLANA_NETWORK,
      pinataConfigured: !!(PINATA_API_KEY && PINATA_SECRET_KEY),
      creatorKeyConfigured: !!CREATOR_PRIVATE_KEY,
    },
  })
})

// Blockhash endpoint
app.get("/blockhash", async (req, res) => {
  try {
    const { blockhash } = await connection.getLatestBlockhash()
    res.json({
      success: true,
      blockhash: blockhash,
      network: SOLANA_NETWORK,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Blockhash error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Test Pinata endpoint
app.get("/test-pinata", async (req, res) => {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    return res.status(500).json({
      success: false,
      error: "Pinata API credentials not configured",
    })
  }

  try {
    const testData = {
      name: "Test NFT",
      description: "This is a test NFT metadata",
      image: "https://via.placeholder.com/500x500.png?text=Test+NFT",
      attributes: [{ trait_type: "Test", value: "True" }],
    }

    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: testData,
        pinataMetadata: {
          name: `test-metadata-${Date.now()}.json`,
        },
      },
      {
        headers: {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
        },
      },
    )

    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`

    res.json({
      success: true,
      message: "Pinata connection successful",
      metadataUrl: metadataUrl,
      ipfsHash: response.data.IpfsHash,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Pinata test error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || "Unknown error",
    })
  }
})

// Mint NFT endpoint
app.post("/mint-nft", async (req, res) => {
  try {
    const { walletAddress, metadata } = req.body

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      })
    }

    // Check environment variables
    if (!CREATOR_PRIVATE_KEY) {
      return res.status(500).json({
        success: false,
        error: "CREATOR_PRIVATE_KEY not configured",
      })
    }

    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: "Pinata API credentials not configured",
      })
    }

    console.log("🎨 === NFT MINTING REQUEST ===")
    console.log("👤 Wallet:", walletAddress)
    console.log("📋 Metadata:", JSON.stringify(metadata, null, 2))

    // Validate wallet address
    try {
      new PublicKey(walletAddress)
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address format",
      })
    }

    // Step 1: Upload metadata to Pinata
    console.log("📤 Step 1: Uploading metadata...")

    const pinataResponse = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: metadata,
        pinataMetadata: {
          name: `nft-metadata-${Date.now()}.json`,
        },
      },
      {
        headers: {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
        },
        timeout: 30000,
      },
    )

    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`
    console.log("✅ Metadata uploaded to Pinata:", metadataUrl)

    // Step 2: Initialize Solana connection and mint NFT
    console.log("⚡ Step 2: Minting NFT...")

    // Parse private key
    let privateKeyArray
    if (CREATOR_PRIVATE_KEY.startsWith("[")) {
      privateKeyArray = JSON.parse(CREATOR_PRIVATE_KEY)
    } else {
      privateKeyArray = Array.from(bs58.decode(CREATOR_PRIVATE_KEY))
    }

    // Create Web3.js keypair
    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString())

    // Check creator wallet balance
    const balance = await connection.getBalance(creatorKeypair.publicKey)
    console.log("💰 Creator wallet balance:", balance / LAMPORTS_PER_SOL, "SOL")

    if (balance < 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(
        `Insufficient SOL in creator wallet. Balance: ${balance / LAMPORTS_PER_SOL} SOL. Please fund the wallet.`,
      )
    }

    // Initialize UMI with Metaplex Core
    const umi = createUmi(SOLANA_RPC_URL).use(mplCore())
    const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
    const creatorUmi = umi.use(keypairIdentity(umiKeypair))

    // Generate asset signer
    const asset = generateSigner(creatorUmi)
    console.log("🔑 Generated asset address:", asset.publicKey)

    // Prepare collection (if provided)
    let collectionConfig = none()
    if (metadata.collection && metadata.collection.trim()) {
      try {
        const collectionPubkey = publicKey(metadata.collection.trim())
        collectionConfig = some({ key: collectionPubkey, verified: false })
        console.log("📁 Collection configured:", metadata.collection)
      } catch (error) {
        console.log("⚠️ Invalid collection address, proceeding without collection")
      }
    }

    console.log("⚡ Creating NFT with Metaplex Core...")

    // Create the NFT using Metaplex Core
    const createInstruction = createV1(creatorUmi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      uri: metadataUrl,
      collection: collectionConfig,
    })

    // Execute the transaction
    console.log("📡 Submitting transaction to Solana...")
    const result = await createInstruction.sendAndConfirm(creatorUmi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: false },
    })

    console.log("🎉 === NFT MINTED SUCCESSFULLY! ===")
    console.log("🔗 Asset address:", asset.publicKey)
    console.log("📝 Transaction signature:", result.signature)

    const explorerUrl = `https://explorer.solana.com/address/${asset.publicKey}${SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""}`

    res.json({
      success: true,
      mintAddress: asset.publicKey,
      transactionSignature: result.signature,
      metadataUrl: metadataUrl,
      explorerUrl: explorerUrl,
      network: SOLANA_NETWORK,
      method: "metaplex_core",
      message: "NFT minted successfully on Solana with Metaplex Core!",
    })
  } catch (error) {
    console.error("❌ Mint NFT error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})

module.exports = app
