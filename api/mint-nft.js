const { Connection, PublicKey, Keypair, clusterApiUrl } = require("@solana/web3.js")
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults")
const { mplCore, createV1, ruleSet } = require("@metaplex-foundation/mpl-core")
const { keypairIdentity, generateSigner, percentAmount } = require("@metaplex-foundation/umi")
const { fromWeb3JsKeypair } = require("@metaplex-foundation/umi-web3js-adapters")
const bs58 = require("bs58")
const axios = require("axios")

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

// Upload to IPFS via Pinata
async function uploadToPinata(imageBuffer, metadata) {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    throw new Error("Pinata API credentials not configured")
  }

  try {
    // Upload image first
    const imageFormData = new FormData()
    const imageBlob = new Blob([imageBuffer], { type: "image/png" })
    imageFormData.append("file", imageBlob, "nft-image.png")

    const imageResponse = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", imageFormData, {
      headers: {
        "Content-Type": "multipart/form-data",
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    })

    const imageUri = `https://gateway.pinata.cloud/ipfs/${imageResponse.data.IpfsHash}`
    console.log("📸 Image uploaded to IPFS:", imageUri)

    // Create metadata with image URI
    const fullMetadata = {
      ...metadata,
      image: imageUri,
    }

    // Upload metadata
    const metadataResponse = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", fullMetadata, {
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    })

    const metadataUri = `https://gateway.pinata.cloud/ipfs/${metadataResponse.data.IpfsHash}`
    console.log("📄 Metadata uploaded to IPFS:", metadataUri)

    return { imageUri, metadataUri }
  } catch (error) {
    console.error("❌ Pinata upload error:", error.response?.data || error.message)
    throw new Error(`Failed to upload to IPFS: ${error.message}`)
  }
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const { name, description, image, attributes, recipientAddress } = req.body

    // Validate required fields
    if (!name || !description || !image || !recipientAddress) {
      return res.status(400).json({
        error: "Missing required fields",
        required: ["name", "description", "image", "recipientAddress"],
      })
    }

    // Validate recipient address
    let recipientPublicKey
    try {
      recipientPublicKey = new PublicKey(recipientAddress)
    } catch (error) {
      return res.status(400).json({
        error: "Invalid recipient address",
        message: error.message,
      })
    }

    // Check if we're in simulation mode
    if (!creatorUmi) {
      return res.status(200).json({
        success: true,
        simulation: true,
        message: "NFT minting simulated (no private key configured)",
        data: {
          name,
          description,
          recipientAddress,
          network: SOLANA_NETWORK,
          timestamp: new Date().toISOString(),
        },
      })
    }

    // Convert image from base64 if needed
    let imageBuffer
    if (image.startsWith("data:image/")) {
      const base64Data = image.split(",")[1]
      imageBuffer = Buffer.from(base64Data, "base64")
    } else if (image.startsWith("http")) {
      // Download image from URL
      const imageResponse = await axios.get(image, { responseType: "arraybuffer" })
      imageBuffer = Buffer.from(imageResponse.data)
    } else {
      return res.status(400).json({
        error: "Invalid image format",
        message: "Image must be base64 data URL or HTTP URL",
      })
    }

    // Prepare metadata
    const metadata = {
      name,
      description,
      attributes: attributes || [],
      properties: {
        files: [
          {
            uri: "", // Will be filled after upload
            type: "image/png",
          },
        ],
        category: "image",
      },
    }

    // Upload to IPFS
    console.log("📤 Uploading to IPFS...")
    const { imageUri, metadataUri } = await uploadToPinata(imageBuffer, metadata)

    // Generate asset keypair
    const asset = generateSigner(creatorUmi)

    console.log("🎨 Minting NFT with Metaplex Core...")
    console.log("Asset address:", asset.publicKey.toString())
    console.log("Recipient:", recipientAddress)

    // Create the NFT using Metaplex Core
    const createResult = await createV1(creatorUmi, {
      asset,
      name,
      uri: metadataUri,
      owner: recipientPublicKey.toString(),
      plugins: [
        {
          type: "Royalties",
          basisPoints: 500, // 5% royalties
          creators: [
            {
              address: creatorKeypair.publicKey.toString(),
              percentage: 100,
            },
          ],
          ruleSet: ruleSet("None"),
        },
      ],
    }).sendAndConfirm(creatorUmi)

    console.log("✅ NFT minted successfully!")
    console.log("Transaction signature:", createResult.signature)

    // Return success response
    res.status(200).json({
      success: true,
      message: "NFT minted successfully",
      data: {
        assetId: asset.publicKey.toString(),
        transactionSignature: createResult.signature,
        name,
        description,
        imageUri,
        metadataUri,
        recipientAddress,
        network: SOLANA_NETWORK,
        explorerUrl: `https://explorer.solana.com/address/${asset.publicKey.toString()}${
          SOLANA_NETWORK !== "mainnet-beta" ? `?cluster=${SOLANA_NETWORK}` : ""
        }`,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error("❌ NFT minting error:", error)

    // Return detailed error information
    res.status(500).json({
      success: false,
      error: "NFT minting failed",
      message: error.message,
      details: error.stack,
      timestamp: new Date().toISOString(),
    })
  }
}
