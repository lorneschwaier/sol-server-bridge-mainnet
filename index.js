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

// Middleware
app.use(cors())
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Environment variables
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
const PINATA_API_KEY = process.env.PINATA_API_KEY
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY

// Initialize Solana connection
const connection = new Connection(SOLANA_RPC_URL, "confirmed")

// Initialize creator keypair
let creatorKeypair = null
let creatorUmi = null

if (CREATOR_PRIVATE_KEY) {
  try {
    let privateKeyArray
    if (CREATOR_PRIVATE_KEY.startsWith("[")) {
      privateKeyArray = JSON.parse(CREATOR_PRIVATE_KEY)
    } else {
      privateKeyArray = Array.from(bs58.decode(CREATOR_PRIVATE_KEY))
    }

    creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))

    const umi = createUmi(SOLANA_RPC_URL).use(mplCore())
    const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
    creatorUmi = umi.use(keypairIdentity(umiKeypair))

    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString())
  } catch (error) {
    console.error("❌ Error loading creator keypair:", error.message)
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    network: SOLANA_NETWORK,
    rpcUrl: SOLANA_RPC_URL,
    environment: {
      pinataConfigured: !!(PINATA_API_KEY && PINATA_SECRET_KEY),
      creatorKeyConfigured: !!CREATOR_PRIVATE_KEY,
      creatorWalletLoaded: !!creatorKeypair,
      metaplexReady: !!creatorUmi,
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
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Upload to Pinata
async function uploadToPinata(metadata) {
  try {
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      throw new Error("Pinata API credentials not configured")
    }

    const response = await axios.post(
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

    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`
    return {
      success: true,
      url: metadataUrl,
      cid: response.data.IpfsHash,
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    }
  }
}

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

    if (!creatorUmi) {
      return res.status(500).json({
        success: false,
        error: "Creator wallet not configured",
      })
    }

    // Validate wallet address
    try {
      new PublicKey(walletAddress)
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address format",
      })
    }

    // Check creator wallet balance
    const balance = await connection.getBalance(creatorKeypair.publicKey)
    if (balance < 0.01 * LAMPORTS_PER_SOL) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL in creator wallet. Balance: ${balance / LAMPORTS_PER_SOL} SOL`,
      })
    }

    // Upload metadata to Pinata
    const uploadResult = await uploadToPinata(metadata)
    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to upload metadata: " + uploadResult.error,
      })
    }

    // Generate asset signer
    const asset = generateSigner(creatorUmi)

    // Prepare collection (if provided)
    let collectionConfig = none()
    if (metadata.collection && metadata.collection.trim()) {
      try {
        const collectionPubkey = publicKey(metadata.collection.trim())
        collectionConfig = some({ key: collectionPubkey, verified: false })
      } catch (error) {
        console.log("Invalid collection address, proceeding without collection")
      }
    }

    // Create the NFT using Metaplex Core
    const createInstruction = createV1(creatorUmi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      uri: uploadResult.url,
      collection: collectionConfig,
    })

    // Execute the transaction
    const result = await createInstruction.sendAndConfirm(creatorUmi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: false },
    })

    const explorerUrl = `https://explorer.solana.com/address/${asset.publicKey}${SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""}`

    res.json({
      success: true,
      mintAddress: asset.publicKey,
      transactionSignature: result.signature,
      metadataUrl: uploadResult.url,
      explorerUrl: explorerUrl,
      network: SOLANA_NETWORK,
      message: "NFT minted successfully!",
    })
  } catch (error) {
    console.error("Mint NFT error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Test Pinata endpoint
app.get("/test-pinata", async (req, res) => {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    return res.json({
      success: false,
      configured: false,
      error: "Pinata API credentials not configured",
    })
  }

  try {
    const testData = {
      pinataContent: {
        name: "Test NFT",
        description: "Test NFT metadata",
        image: "https://example.com/test.png",
      },
    }

    const response = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", testData, {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    })

    res.json({
      success: true,
      configured: true,
      url: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`,
      cid: response.data.IpfsHash,
    })
  } catch (error) {
    res.json({
      success: false,
      configured: true,
      error: error.message,
    })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Solana Bridge Server running on port ${PORT}`)
  console.log(`📡 Network: ${SOLANA_NETWORK}`)
  console.log(`🔗 RPC URL: ${SOLANA_RPC_URL}`)
  console.log(`💾 Pinata: ${PINATA_API_KEY && PINATA_SECRET_KEY ? "✅ Configured" : "❌ Not configured"}`)
  console.log(`🔑 Creator Wallet: ${creatorKeypair ? "✅ Loaded" : "❌ Not loaded"}`)
  console.log(`⚡ Metaplex: ${creatorUmi ? "✅ Ready" : "❌ Not ready"}`)
})

module.exports = app
