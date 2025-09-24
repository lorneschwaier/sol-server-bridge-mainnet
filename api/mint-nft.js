// Buffer polyfill fix for Vercel ES modules
import { Buffer } from "buffer"
globalThis.Buffer = Buffer

import { Connection, PublicKey, Keypair, clusterApiUrl } from "@solana/web3.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createV1 } from "@metaplex-foundation/mpl-core"
import { keypairIdentity, generateSigner, publicKey } from "@metaplex-foundation/umi"
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters"
import axios from "axios"
import bs58 from "bs58"
import FormData from "form-data"

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

    let privateKeyArray
    if (CREATOR_PRIVATE_KEY.startsWith("[")) {
      privateKeyArray = JSON.parse(CREATOR_PRIVATE_KEY)
    } else {
      privateKeyArray = Array.from(bs58.decode(CREATOR_PRIVATE_KEY))
    }

    creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString())

    const umi = createUmi(SOLANA_RPC_URL)
    const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
    creatorUmi = umi.use(keypairIdentity(umiKeypair))

    console.log("⚡ Metaplex Core UMI initialized successfully")
  } catch (error) {
    console.error("❌ Error loading creator keypair:", error.message)
  }
}

// Upload image to Pinata IPFS
async function uploadImageToPinata(imageUrl) {
  try {
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      throw new Error("Pinata API credentials not configured")
    }

    console.log("📥 Downloading image from:", imageUrl)

    // Try fetch instead of axios to bypass 403 issues
    const imageResponse = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "image/*,*/*",
        Referer: "https://x1xo.com/",
      },
    })

    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`)
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())

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

    form.append("file", imageBuffer, {
      filename: `nft-image-${Date.now()}.${fileExtension}`,
      contentType: `image/${fileExtension}`,
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
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
      timeout: 60000,
    })

    const imageIpfsUrl = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`
    console.log("✅ Image uploaded to IPFS:", imageIpfsUrl)

    return {
      success: true,
      url: imageIpfsUrl,
      cid: pinataResponse.data.IpfsHash,
      service: "pinata",
    }
  } catch (error) {
    console.error("❌ Image upload failed:", error.message)
    return {
      success: false,
      error: error.message,
      service: "pinata",
    }
  }
}

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

// Real NFT Minting with Metaplex Core
async function mintNFTWithMetaplexCore(walletAddress, metadata, metadataUrl) {
  try {
    if (!creatorUmi) {
      throw new Error("Metaplex Core UMI not initialized - creator private key required")
    }

    console.log("🎨 === STARTING REAL NFT MINT WITH METAPLEX CORE ===")
    console.log("👤 Recipient:", walletAddress)
    console.log("📋 Metadata URL:", metadataUrl)
    console.log("🏷️ NFT Name:", metadata.name)

    console.log("💰 Skipping balance check - proceeding with mint")

    // Generate asset signer
    const asset = generateSigner(creatorUmi)
    console.log("🔑 Generated asset address:", asset.publicKey)

    console.log("⚡ Creating NFT with Metaplex Core...")

    const createInstruction = createV1(creatorUmi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      uri: metadataUrl,
      owner: publicKey(walletAddress),
    })

    // Execute the transaction
    console.log("📡 Submitting transaction to Solana...")
    const result = await createInstruction.sendAndConfirm(creatorUmi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: false },
    })

    console.log("🎉 === NFT MINTED SUCCESSFULLY WITH METAPLEX CORE! ===")
    console.log("🔗 Asset address:", asset.publicKey)
    console.log("📝 Transaction signature:", result.signature)

    const explorerUrl = `https://explorer.solana.com/address/${asset.publicKey}${
      SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""
    }`

    return {
      success: true,
      mintAddress: asset.publicKey,
      transactionSignature: result.signature,
      metadataUrl: metadataUrl,
      explorerUrl: explorerUrl,
      method: "metaplex_core",
      network: SOLANA_NETWORK,
    }
  } catch (error) {
    console.error("❌ Metaplex Core minting failed:", error)
    return {
      success: false,
      error: error.message,
      method: "metaplex_core",
    }
  }
}

export default async function handler(req, res) {
  if (!res || typeof res.setHeader !== "function") {
    console.log("[v0] Skipping execution in preview environment - this file is meant for Vercel deployment")
    return
  }

  // Set CORS headers - FIXED FOR YOUR WEBSITE
  res.setHeader("Access-Control-Allow-Origin", "https://x1xo.com")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  res.setHeader("Access-Control-Allow-Credentials", "true")

  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" })
  }

  try {
    const { walletAddress, metadata } = req.body

    console.log("🎨 === REAL NFT MINTING REQUEST (METAPLEX CORE) ===")
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

    // Step 1: Upload image to IPFS - CONFIGURABLE OPTION
    let finalImageUrl = metadata.image
    const useIPFS = metadata.use_ipfs || false // Add this option from WordPress

    console.log("[v0] Debug - useIPFS flag:", useIPFS)
    console.log("[v0] Debug - metadata.image:", metadata.image)
    console.log("[v0] Debug - image exists:", !!metadata.image)

    if (metadata.image && useIPFS) {
      console.log("📸 Step 1: Uploading image to IPFS (user chose decentralized storage)...")
      console.log("🔍 Original image URL:", metadata.image)
      console.log("🔍 useIPFS flag:", useIPFS)
      console.log("[v0] Debug - About to call uploadImageToPinata with URL:", metadata.image)

      const imageUploadResult = await uploadImageToPinata(metadata.image)

      console.log("[v0] Debug - Image upload result:", JSON.stringify(imageUploadResult, null, 2))

      if (imageUploadResult.success) {
        finalImageUrl = imageUploadResult.url
        console.log("✅ Image uploaded to IPFS successfully:", finalImageUrl)
      } else {
        console.error("❌ IPFS image upload failed, falling back to website image:", imageUploadResult.error)
        finalImageUrl = metadata.image // Keep original website image as fallback
      }
    } else if (!useIPFS) {
      console.log("📸 Using website image (fast option chosen):", finalImageUrl)
    } else {
      console.log("📸 No image provided or useIPFS is false")
      console.log("[v0] Debug - metadata.image exists:", !!metadata.image)
      console.log("[v0] Debug - useIPFS value:", useIPFS)
    }

    // Step 2: Create final metadata - MAGIC EDEN COMPATIBLE FORMAT
    const finalMetadata = {
      name: metadata.name || "WordPress NFT",
      symbol: "XENO", // This symbol should now appear on Solana Explorer
      description: metadata.description || "NFT created via WordPress store",
      image: finalImageUrl,

      // Keep this for marketplaces like Magic Eden
      external_url: "https://x1xo.com",

      extensions: {
        website: "https://x1xo.com",
        // optional but nice to have:
        twitter: "https://x.com/x1xoai",
      },

      seller_fee_basis_points: 500, // 5% royalty for Magic Eden
      attributes: [
        { trait_type: "Product ID", value: String(metadata.product_id || "unknown") },
        { trait_type: "Platform", value: "WordPress" },
        { trait_type: "Creator", value: "x1xo.com" }, // Updated creator name
        { trait_type: "Minted Date", value: new Date().toISOString().split("T")[0] },
        ...(metadata.attributes || []),
      ],
      properties: {
        files: [
          {
            uri: finalImageUrl,
            type: finalImageUrl.includes(".jpg") || finalImageUrl.includes(".jpeg") ? "image/jpeg" : "image/png",
          },
        ],
        category: "image",
        creators: [
          {
            address: creatorKeypair.publicKey.toString(),
            verified: true,
            share: 100,
          },
        ],
      },
    }

    console.log("📋 Final metadata:", JSON.stringify(finalMetadata, null, 2))

    // Step 3: Upload metadata to IPFS
    console.log("📤 Step 2: Uploading metadata...")
    const uploadResult = await uploadToPinata(finalMetadata)

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to upload metadata: " + uploadResult.error,
      })
    }

    // Step 4: Mint NFT with Metaplex Core
    console.log("⚡ Step 3: Minting NFT with Metaplex Core...")
    const mintResult = await mintNFTWithMetaplexCore(walletAddress, finalMetadata, uploadResult.url)

    if (!mintResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to mint NFT: " + mintResult.error,
        metadataUrl: uploadResult.url,
      })
    }

    console.log("🎉 === NFT MINTING COMPLETE (METAPLEX CORE) ===")

    res.json({
      success: true,
      mintAddress: mintResult.mintAddress,
      transactionSignature: mintResult.transactionSignature,
      metadataUrl: uploadResult.url,
      imageUrl: finalImageUrl,
      explorerUrl: mintResult.explorerUrl,
      network: SOLANA_NETWORK,
      method: "metaplex_core",
      message: "NFT minted successfully on Solana with Metaplex Core!",
    })
  } catch (error) {
    console.error("❌ Mint NFT error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
