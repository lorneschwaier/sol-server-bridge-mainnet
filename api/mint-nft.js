const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = require("@solana/web3.js")
const { Metaplex, keypairIdentity, bundlrStorage } = require("@metaplex-foundation/js")
const axios = require("axios")
const bs58 = require("bs58")
const FormData = require("form-data")
const fetch = require("node-fetch")

// Environment variables
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ||
  (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))
const CREATOR_WALLET = process.env.CREATOR_WALLET
const PINATA_API_KEY = process.env.PINATA_API_KEY
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY

// Initialize Solana connection
const connection = new Connection(SOLANA_RPC_URL, "confirmed")

// Initialize creator keypair and Metaplex
let creatorKeypair = null
let metaplex = null

if (CREATOR_WALLET) {
  try {
    console.log("🔑 Loading creator wallet...")

    const privateKeyArray = JSON.parse(CREATOR_WALLET)
    creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString())

    metaplex = Metaplex.make(connection).use(keypairIdentity(creatorKeypair)).use(bundlrStorage())

    console.log("⚡ Metaplex initialized successfully")
  } catch (error) {
    console.error("❌ Error loading creator keypair:", error.message)
  }
}

// Upload image to Pinata IPFS
async function uploadImageToPinata(imageUrl, apiKey, secretKey) {
  try {
    console.log("📥 Downloading image from:", imageUrl)

    // Download the image
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    })

    console.log("✅ Image downloaded, size:", imageResponse.data.length, "bytes")

    // Get file extension from URL or content type
    let fileExtension = "png"
    if (imageUrl.includes(".jpg") || imageUrl.includes(".jpeg")) {
      fileExtension = "jpg"
    } else if (imageUrl.includes(".gif")) {
      fileExtension = "gif"
    } else if (imageUrl.includes(".webp")) {
      fileExtension = "webp"
    }

    // Create form data for Pinata
    const form = new FormData()

    form.append("file", Buffer.from(imageResponse.data), {
      filename: `nft-image-${Date.now()}.${fileExtension}`,
      contentType: imageResponse.headers["content-type"] || `image/${fileExtension}`,
    })

    form.append(
      "pinataMetadata",
      JSON.stringify({
        name: `nft-image-${Date.now()}.${fileExtension}`,
      }),
    )

    console.log("📤 Uploading image to Pinata IPFS...")

    const pinataResponse = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
      headers: {
        ...form.getHeaders(),
        pinata_api_key: apiKey,
        pinata_secret_api_key: secretKey,
      },
      timeout: 60000,
    })

    const imageIpfsUrl = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`
    console.log("✅ Image uploaded to IPFS:", imageIpfsUrl)

    return imageIpfsUrl
  } catch (error) {
    console.error("❌ Image upload failed:", error.message)
    // Return original URL as fallback
    return imageUrl
  }
}

// Helper function to get content type based on file extension
function getContentType(extension) {
  const contentTypes = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
  }
  return contentTypes[extension.toLowerCase()] || "image/png"
}

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

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    })
  }

  try {
    const { walletAddress, metadata } = req.body

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      })
    }

    console.log("🎨 Starting NFT minting process...")
    console.log("   - Wallet:", walletAddress)
    console.log("   - Network:", SOLANA_NETWORK)
    console.log("   - Image URL:", metadata.image)

    // Upload image to Pinata IPFS if it's a WordPress URL
    let finalImageUrl = metadata.image
    if (metadata.image && !metadata.image.includes("ipfs://") && !metadata.image.includes("gateway.pinata.cloud")) {
      console.log("📸 Uploading image to Pinata IPFS...")
      finalImageUrl = await uploadImageToPinata(metadata.image, PINATA_API_KEY, PINATA_SECRET_KEY)
      console.log("✅ Image uploaded to IPFS:", finalImageUrl)
    }

    // Create metadata object
    const nftMetadata = {
      name: metadata.name,
      symbol: metadata.symbol,
      description: metadata.description,
      image: finalImageUrl,
      attributes: metadata.attributes || [],
      properties: {
        files: [
          {
            uri: finalImageUrl,
            type: getContentType(finalImageUrl.split(".").pop().toLowerCase()),
          },
        ],
        category: "image",
      },
    }

    console.log("📝 Uploading metadata to Arweave...")

    // Upload metadata to Arweave
    const { uri: metadataUri } = await metaplex.nfts().uploadMetadata(nftMetadata)

    console.log("✅ Metadata uploaded:", metadataUri)
    console.log("🎨 Creating NFT...")

    // Create NFT
    const { nft } = await metaplex.nfts().create({
      uri: metadataUri,
      name: metadata.name,
      symbol: metadata.symbol,
      sellerFeeBasisPoints: 500, // 5% royalty
      creators: [
        {
          address: creatorKeypair.publicKey,
          verified: true,
          share: 100,
        },
      ],
      collection: null,
      uses: null,
    })

    console.log("✅ NFT created successfully!")
    console.log("   - Mint Address:", nft.address.toString())
    console.log("   - Metadata URI:", metadataUri)

    // Transfer NFT to the buyer
    console.log("📤 Transferring NFT to buyer...")

    const buyerPublicKey = new PublicKey(walletAddress)

    await metaplex.nfts().transfer({
      nftOrSft: nft,
      toOwner: buyerPublicKey,
    })

    console.log("✅ NFT transferred successfully!")

    res.status(200).json({
      success: true,
      mintAddress: nft.address.toString(),
      metadataUri: metadataUri,
      imageUrl: finalImageUrl,
      transactionSignature: "transfer_completed",
      message: "NFT minted and transferred successfully",
    })
  } catch (error) {
    console.error("❌ Minting error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}
