const { Connection, PublicKey, Keypair } = require("@solana/web3.js")
const { createUmi } = require("@metaplex-foundation/umi")
const { web3JsRpc } = require("@metaplex-foundation/umi-rpc-web3js")
const { web3JsEddsa } = require("@metaplex-foundation/umi-eddsa-web3js")
const { mplTokenMetadata } = require("@metaplex-foundation/mpl-token-metadata")
const bs58 = require("bs58")

// Global variables for services
let umi = null
let creatorKeypair = null

async function initializeServices() {
  console.log("🚀 Initializing minting services...")

  try {
    const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY

    if (!CREATOR_PRIVATE_KEY) {
      throw new Error("CREATOR_PRIVATE_KEY environment variable is required")
    }

    if (!RPC_URL) {
      throw new Error("SOLANA_RPC_URL environment variable is required")
    }

    console.log("🔗 Creating UMI instance...")

    // Create UMI with correct plugins
    umi = createUmi(RPC_URL).use(web3JsRpc()).use(web3JsEddsa()).use(mplTokenMetadata())

    console.log("✅ UMI instance created successfully")

    // Create creator keypair
    console.log("🔑 Setting up creator keypair...")

    let privateKeyBytes
    try {
      // Try base58 decode first
      privateKeyBytes = bs58.decode(CREATOR_PRIVATE_KEY)
    } catch (e) {
      try {
        // Try JSON array format
        privateKeyBytes = new Uint8Array(JSON.parse(CREATOR_PRIVATE_KEY))
      } catch (e2) {
        throw new Error("Invalid CREATOR_PRIVATE_KEY format. Must be base58 string or JSON array")
      }
    }

    if (privateKeyBytes.length !== 64) {
      throw new Error(`Invalid private key length: ${privateKeyBytes.length}. Expected 64 bytes.`)
    }

    creatorKeypair = Keypair.fromSecretKey(privateKeyBytes)
    console.log("✅ Creator keypair created:", creatorKeypair.publicKey.toString())

    // Set the identity
    const { createSignerFromKeypair } = require("@metaplex-foundation/umi")
    const creatorSigner = createSignerFromKeypair(umi, {
      publicKey: creatorKeypair.publicKey.toString(),
      secretKey: privateKeyBytes,
    })

    umi = umi.use({
      install: (context) => {
        context.identity = creatorSigner
      },
    })

    console.log("✅ Services initialized successfully")
    return true
  } catch (error) {
    console.error("❌ Failed to initialize services:", error)
    throw new Error(`Failed to initialize minting services - ${error.message}`)
  }
}

async function uploadMetadataToIPFS(metadata) {
  console.log("📤 Uploading metadata to IPFS...")

  try {
    const PINATA_API_KEY = process.env.PINATA_API_KEY
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY

    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      console.log("⚠️ Pinata keys not found, using placeholder URI")
      return "https://placeholder-metadata.com/nft.json"
    }

    const axios = require("axios")

    const response = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadata, {
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    })

    const metadataUri = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`
    console.log("✅ Metadata uploaded to IPFS:", metadataUri)
    return metadataUri
  } catch (error) {
    console.error("❌ IPFS upload failed:", error)
    return "https://placeholder-metadata.com/nft.json"
  }
}

async function mintNFT(walletAddress, metadata) {
  console.log("🎨 Starting NFT minting process...")

  try {
    if (!umi || !creatorKeypair) {
      throw new Error("Services not initialized")
    }

    // Upload metadata to IPFS
    const metadataUri = await uploadMetadataToIPFS(metadata)

    // Generate a new mint keypair
    const { generateSigner } = require("@metaplex-foundation/umi")
    const mint = generateSigner(umi)

    console.log("🎯 Mint address:", mint.publicKey)
    console.log("👤 Recipient:", walletAddress)
    console.log("📋 Metadata URI:", metadataUri)

    // Create the NFT
    const { createNft } = require("@metaplex-foundation/mpl-token-metadata")

    const createNftInstruction = createNft(umi, {
      mint,
      name: metadata.name,
      symbol: metadata.symbol || "NFT",
      uri: metadataUri,
      sellerFeeBasisPoints: metadata.royalty || 0,
      creators: [
        {
          address: creatorKeypair.publicKey.toString(),
          verified: true,
          share: 100,
        },
      ],
      owner: walletAddress,
    })

    console.log("📝 Sending create NFT transaction...")

    const result = await createNftInstruction.sendAndConfirm(umi)

    console.log("✅ NFT created successfully!")
    console.log("🔗 Transaction signature:", result.signature)

    return {
      success: true,
      mint_address: mint.publicKey,
      transaction_signature: result.signature,
      metadata_uri: metadataUri,
      explorer_url: `https://explorer.solana.com/address/${mint.publicKey}?cluster=mainnet-beta`,
      transaction_url: `https://explorer.solana.com/tx/${result.signature}?cluster=mainnet-beta`,
    }
  } catch (error) {
    console.error("❌ NFT minting failed:", error)
    throw new Error(`NFT minting failed: ${error.message}`)
  }
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    })
  }

  try {
    console.log("🎨 === NFT MINTING REQUEST ===")
    console.log("📋 Request body:", JSON.stringify(req.body, null, 2))

    const { walletAddress, metadata } = req.body

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      })
    }

    // Validate wallet address
    try {
      new PublicKey(walletAddress)
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address format",
      })
    }

    // Initialize services if not already done
    if (!umi || !creatorKeypair) {
      await initializeServices()
    }

    // Mint the NFT
    const result = await mintNFT(walletAddress, metadata)

    console.log("✅ Minting completed successfully")
    return res.status(200).json(result)
  } catch (error) {
    console.error("❌ Minting error:", error)
    console.error("❌ Stack trace:", error.stack)

    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
}
