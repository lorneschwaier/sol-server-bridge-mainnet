const express = require("express")
const cors = require("cors")
const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = require("@solana/web3.js")
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults")
const { createNft, mplTokenMetadata } = require("@metaplex-foundation/mpl-token-metadata")
const { createSignerFromKeypair, signerIdentity, generateSigner } = require("@metaplex-foundation/umi")
const axios = require("axios")
const bs58 = require("bs58")

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// Environment variables
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "devnet"
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK)
const PINATA_API_KEY = process.env.PINATA_API_KEY
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY

// Initialize Solana connection
const connection = new Connection(SOLANA_RPC_URL, "confirmed")

// Initialize UMI and creator keypair
let creatorKeypair = null
let umi = null

if (CREATOR_PRIVATE_KEY) {
  try {
    console.log("🔑 Loading creator wallet with MODERN Metaplex UMI...")

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

    // Initialize UMI with modern Metaplex
    umi = createUmi(SOLANA_RPC_URL)

    // Convert Web3.js keypair to UMI keypair
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(privateKeyArray))
    const signer = createSignerFromKeypair(umi, umiKeypair)

    umi.use(signerIdentity(signer))
    umi.use(mplTokenMetadata())

    console.log("🎨 MODERN Metaplex UMI initialized for REAL NFT minting!")
  } catch (error) {
    console.error("❌ Error loading creator keypair:", error.message)
  }
}

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    service: "Solana NFT Bridge",
    version: "5.0.0-MODERN-METAPLEX-UMI",
    status: "online",
    mode: umi && PINATA_API_KEY && PINATA_SECRET_KEY ? "REAL_NFT_MINTING" : "simulation",
    endpoints: ["/health", "/test-metaplex", "/test-pinata", "/mint-nft", "/debug-env"],
    authentication: "disabled",
    metaplexReady: !!umi,
    framework: "UMI",
    note: "MODERN METAPLEX UMI NFT MINTING ENABLED!",
  })
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    network: SOLANA_NETWORK,
    rpcUrl: SOLANA_RPC_URL,
    mode: umi && PINATA_API_KEY && PINATA_SECRET_KEY ? "REAL_NFT_MINTING" : "simulation",
    environment: {
      pinataConfigured: !!(PINATA_API_KEY && PINATA_SECRET_KEY),
      creatorKeyConfigured: !!CREATOR_PRIVATE_KEY,
      creatorWalletLoaded: !!creatorKeypair,
      metaplexUmiReady: !!umi,
    },
    authentication: "disabled",
    version: "5.0.0-MODERN-METAPLEX-UMI",
    framework: "UMI",
  })
})

// Test Metaplex UMI setup
app.get("/test-metaplex", async (req, res) => {
  try {
    console.log("🧪 Testing MODERN Metaplex UMI setup...")

    if (!creatorKeypair) {
      return res.json({
        success: false,
        error: "Creator private key not configured",
        configured: false,
      })
    }

    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      return res.json({
        success: false,
        error: "Pinata API credentials not configured",
        configured: true,
        creatorWallet: creatorKeypair.publicKey.toString(),
      })
    }

    if (!umi) {
      return res.json({
        success: false,
        error: "Metaplex UMI not initialized",
        configured: true,
        creatorWallet: creatorKeypair.publicKey.toString(),
      })
    }

    // Check wallet balance
    const balance = await connection.getBalance(creatorKeypair.publicKey)

    res.json({
      success: true,
      configured: true,
      creatorWallet: creatorKeypair.publicKey.toString(),
      balance: balance / LAMPORTS_PER_SOL,
      network: SOLANA_NETWORK,
      rpcUrl: SOLANA_RPC_URL,
      metaplexUmiReady: true,
      version: "5.0.0-MODERN-METAPLEX-UMI",
      framework: "UMI",
      mode: "REAL_NFT_MINTING",
      message:
        balance < 0.01 * LAMPORTS_PER_SOL
          ? "⚠️ Low balance - please fund wallet"
          : "✅ Ready for REAL NFT minting with MODERN Metaplex UMI!",
    })
  } catch (error) {
    console.error("❌ Test Metaplex UMI error:", error)
    res.json({
      success: false,
      error: error.message,
      configured: !!creatorKeypair,
      framework: "UMI",
    })
  }
})

// Upload metadata to Pinata
async function uploadToPinata(metadata) {
  try {
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      throw new Error("Pinata API credentials not configured")
    }

    console.log("📤 Uploading metadata to Pinata...")

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
    console.log("✅ Metadata uploaded to Pinata:", metadataUrl)

    return {
      success: true,
      url: metadataUrl,
      cid: response.data.IpfsHash,
      service: "pinata",
    }
  } catch (error) {
    console.error("❌ Pinata upload failed:", error.message)
    return {
      success: false,
      error: error.message,
      service: "pinata",
    }
  }
}

// REAL NFT creation using MODERN Metaplex UMI
async function createRealNFTWithUMI(walletAddress, metadata, metadataUrl) {
  try {
    if (!umi) {
      throw new Error("Metaplex UMI not initialized - creator private key required")
    }

    console.log("🎨 === STARTING REAL NFT CREATION WITH MODERN METAPLEX UMI ===")
    console.log("👤 Recipient:", walletAddress)
    console.log("📋 Metadata URL:", metadataUrl)
    console.log("🏷️ NFT Name:", metadata.name)

    // Check creator wallet balance
    const balance = await connection.getBalance(creatorKeypair.publicKey)
    console.log("💰 Creator wallet balance:", balance / LAMPORTS_PER_SOL, "SOL")

    if (balance < 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(
        `Insufficient SOL in creator wallet. Balance: ${balance / LAMPORTS_PER_SOL} SOL. Please fund the wallet.`,
      )
    }

    console.log("⚡ Creating REAL NFT with MODERN Metaplex UMI...")

    // Generate mint keypair
    const mint = generateSigner(umi)

    // Create the NFT using modern UMI
    const result = await createNft(umi, {
      mint,
      name: metadata.name || "Unnamed NFT",
      symbol: metadata.symbol || "NFT",
      uri: metadataUrl,
      sellerFeeBasisPoints: (metadata.royalty || 0) * 100,
      creators: [
        {
          address: umi.identity.publicKey,
          verified: true,
          share: 100,
        },
      ],
      isMutable: true,
    }).sendAndConfirm(umi)

    console.log("🎉 === REAL NFT CREATED SUCCESSFULLY WITH MODERN UMI! ===")
    console.log("🔗 NFT Mint Address:", mint.publicKey)
    console.log("📝 Transaction Signature:", result.signature)

    const explorerUrl = `https://explorer.solana.com/address/${mint.publicKey}${
      SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""
    }`

    return {
      success: true,
      mintAddress: mint.publicKey,
      transactionSignature: result.signature,
      metadataUrl: metadataUrl,
      explorerUrl: explorerUrl,
      method: "modern_metaplex_umi",
      network: SOLANA_NETWORK,
      owner: walletAddress,
      framework: "UMI",
    }
  } catch (error) {
    console.error("❌ Modern Metaplex UMI NFT creation failed:", error)
    return {
      success: false,
      error: error.message,
      method: "modern_metaplex_umi",
      framework: "UMI",
    }
  }
}

// NFT Minting Endpoint - MODERN METAPLEX UMI
app.post("/mint-nft", async (req, res) => {
  try {
    const { walletAddress, metadata } = req.body

    console.log("🎨 === MODERN METAPLEX UMI NFT MINTING REQUEST ===")
    console.log("👤 Wallet:", walletAddress)
    console.log("📋 Metadata:", JSON.stringify(metadata, null, 2))

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
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

    // Step 1: Upload metadata to IPFS
    console.log("📤 Step 1: Uploading metadata...")
    const uploadResult = await uploadToPinata(metadata)

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to upload metadata: " + uploadResult.error,
      })
    }

    // Step 2: Create REAL NFT with MODERN Metaplex UMI
    console.log("⚡ Step 2: Creating REAL NFT with MODERN Metaplex UMI...")
    const mintResult = await createRealNFTWithUMI(walletAddress, metadata, uploadResult.url)

    if (!mintResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to create NFT: " + mintResult.error,
        metadataUrl: uploadResult.url,
      })
    }

    console.log("🎉 === MODERN METAPLEX UMI NFT CREATION COMPLETE ===")

    res.json({
      success: true,
      mint_address: mintResult.mintAddress,
      mintAddress: mintResult.mintAddress,
      signature: mintResult.transactionSignature,
      transactionSignature: mintResult.transactionSignature,
      metadataUrl: uploadResult.url,
      explorerUrl: mintResult.explorerUrl,
      network: SOLANA_NETWORK,
      method: "modern_metaplex_umi",
      framework: "UMI",
      message: "REAL NFT created successfully with MODERN Metaplex UMI!",
    })
  } catch (error) {
    console.error("❌ Mint NFT error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
      framework: "UMI",
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
        description: "Test NFT metadata for MODERN Metaplex UMI",
        image: "https://example.com/test.png",
        attributes: [{ trait_type: "Test", value: "Modern UMI v5.0" }],
      },
    }

    const response = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", testData, {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
      timeout: 10000,
    })

    res.json({
      success: true,
      configured: true,
      url: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`,
      cid: response.data.IpfsHash,
      message: "Pinata working correctly for MODERN Metaplex UMI v5.0",
      framework: "UMI",
    })
  } catch (error) {
    res.json({
      success: false,
      configured: true,
      error: error.message,
      framework: "UMI",
    })
  }
})

// Debug environment endpoint
app.get("/debug-env", (req, res) => {
  res.json({
    network: SOLANA_NETWORK,
    rpcUrl: SOLANA_RPC_URL,
    creatorWallet: creatorKeypair ? creatorKeypair.publicKey.toString() : "not loaded",
    pinataConfigured: !!(PINATA_API_KEY && PINATA_SECRET_KEY),
    metaplexUmiReady: !!umi,
    mode: umi && PINATA_API_KEY && PINATA_SECRET_KEY ? "REAL_NFT_MINTING" : "simulation",
    storageProvider: "pinata",
    version: "5.0.0-MODERN-METAPLEX-UMI",
    framework: "UMI",
    authentication: "disabled",
  })
})

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Solana Bridge Server v5.0.0 (MODERN METAPLEX UMI) running on port ${PORT}`)
  console.log(`📡 Network: ${SOLANA_NETWORK}`)
  console.log(`🔗 RPC URL: ${SOLANA_RPC_URL}`)
  console.log(`📌 Pinata IPFS: ${PINATA_API_KEY && PINATA_SECRET_KEY ? "✅ Configured" : "❌ Not configured"}`)
  console.log(`🔑 Creator Wallet: ${creatorKeypair ? "✅ " + creatorKeypair.publicKey.toString() : "❌ Not loaded"}`)
  console.log(`🎨 Metaplex UMI: ${umi ? "✅ Ready for REAL NFT minting" : "❌ Not ready"}`)
  console.log(`🔐 Authentication: DISABLED`)
  console.log(`🏗️ Framework: MODERN METAPLEX UMI`)
})

module.exports = app


