// Buffer polyfill fix for Vercel ES modules
import { Buffer } from "buffer"
globalThis.Buffer = Buffer

import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { create, mplCore, fetchAsset } from "@metaplex-foundation/mpl-core"
import { keypairIdentity, generateSigner, publicKey } from "@metaplex-foundation/umi"
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters"
import axios from "axios"
import bs58 from "bs58"
import FormData from "form-data"

// Environment variables
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"

const RPC_ENDPOINTS = [
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  "https://solana-api.projectserum.com",
  "https://rpc.ankr.com/solana",
  "https://solana-mainnet.g.alchemy.com/v2/demo",
  "https://api.mainnet-beta.solana.com",
]

async function getWorkingRPCConnection() {
  for (const rpcUrl of RPC_ENDPOINTS) {
    try {
      console.log(`🔗 Testing RPC endpoint: ${rpcUrl}`)
      const testConnection = new Connection(rpcUrl, "confirmed")
      const slot = await testConnection.getSlot()
      console.log(`✅ RPC endpoint working: ${rpcUrl} (slot: ${slot})`)
      return testConnection
    } catch (error) {
      console.log(`❌ RPC endpoint failed: ${rpcUrl} - ${error.message}`)
      continue
    }
  }
  throw new Error("All RPC endpoints failed")
}

async function getBalanceWithFallback(publicKey) {
  for (const rpcUrl of RPC_ENDPOINTS) {
    try {
      console.log(`💰 Trying balance check with: ${rpcUrl}`)
      const testConnection = new Connection(rpcUrl, "confirmed")
      const balance = await testConnection.getBalance(publicKey)
      console.log(`✅ Balance check successful: ${balance / LAMPORTS_PER_SOL} SOL`)
      return balance
    } catch (error) {
      console.log(`❌ Balance check failed with ${rpcUrl}: ${error.message}`)
      continue
    }
  }
  throw new Error("failed to get balance of account " + publicKey.toString() + ": All RPC endpoints failed")
}

// Initialize Solana connection with first endpoint
const connection = new Connection(RPC_ENDPOINTS[0], "confirmed")

const PINATA_API_KEY = process.env.PINATA_API_KEY
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY // Declare the creatorPrivateKey variable

// Upload image to Pinata IPFS
async function uploadImageToPinata(imageUrl) {
  try {
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      throw new Error("Pinata API credentials not configured")
    }

    console.log("📥 Downloading image from:", imageUrl)

    let imageBuffer = null
    const downloadAttempts = [
      // Attempt 1: Direct fetch with browser headers
      async () => {
        const response = await fetch(imageUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Accept: "image/*,*/*",
            Referer: "https://x1xo.com/",
            "Cache-Control": "no-cache",
          },
          timeout: 30000,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        return Buffer.from(await response.arrayBuffer())
      },
      // Attempt 2: Axios with different headers
      async () => {
        const response = await axios.get(imageUrl, {
          responseType: "arraybuffer",
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; NFTBot/1.0)",
            Accept: "image/*",
          },
          timeout: 30000,
        })
        return Buffer.from(response.data)
      },
      // Attempt 3: Simple fetch without special headers
      async () => {
        const response = await fetch(imageUrl, { timeout: 30000 })
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        return Buffer.from(await response.arrayBuffer())
      },
    ]

    for (let i = 0; i < downloadAttempts.length; i++) {
      try {
        console.log(`📥 Download attempt ${i + 1}/${downloadAttempts.length}`)
        imageBuffer = await downloadAttempts[i]()
        console.log(`✅ Image downloaded successfully (${imageBuffer.length} bytes)`)
        break
      } catch (error) {
        console.log(`❌ Download attempt ${i + 1} failed:`, error.message)
        if (i === downloadAttempts.length - 1) {
          throw error
        }
      }
    }

    if (!imageBuffer) {
      throw new Error("Failed to download image after all attempts")
    }

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

    let pinataResponse = null
    const maxRetries = 3

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📤 Pinata upload attempt ${attempt}/${maxRetries}`)
        pinataResponse = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
          headers: {
            ...form.getHeaders(),
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_KEY,
          },
          timeout: 60000,
        })
        console.log(`✅ Pinata upload successful on attempt ${attempt}`)
        break
      } catch (error) {
        console.log(`❌ Pinata upload attempt ${attempt} failed:`, error.message)
        if (attempt === maxRetries) {
          throw error
        }
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
      }
    }

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
async function mintNFTWithCore(
  walletAddress,
  metadata,
  metadataUrl,
  creatorKeypair,
  creatorUmi,
  makeImmutable = true,
  royaltyPercentage = 0,
  collectionAddress = null, // Added collection address parameter
) {
  try {
    if (!creatorUmi) {
      throw new Error("Metaplex Core UMI not initialized - creator private key required")
    }

    console.log(`🎨 === STARTING ${makeImmutable ? "IMMUTABLE" : "MUTABLE"} NFT MINT WITH CORE ===`)
    console.log("👤 Recipient:", walletAddress)
    console.log("📋 Metadata URL:", metadataUrl)
    console.log("🏷️ NFT Name:", metadata.name)
    console.log("🔒 Make Immutable:", makeImmutable)
    console.log("💰 Royalty Percentage:", royaltyPercentage + "%")
    if (collectionAddress) {
      console.log("🗂️ Collection Address:", collectionAddress)
    }

    console.log("🔗 Finding working RPC connection...")
    const workingConnection = await getWorkingRPCConnection()
    console.log("✅ Found working RPC connection")

    console.log("💰 === BALANCE CHECK ===")
    console.log("🔑 Creator private key (first 10 chars):", CREATOR_PRIVATE_KEY.substring(0, 10) + "...")
    console.log("🔑 Creator wallet address:", creatorKeypair.publicKey.toString())

    console.log("💰 Attempting balance check with fallback endpoints...")

    try {
      const balance = await getBalanceWithFallback(creatorKeypair.publicKey)
      const balanceSOL = balance / LAMPORTS_PER_SOL
      console.log("💰 Raw balance (lamports):", balance)
      console.log("💰 Balance (SOL):", balanceSOL.toFixed(6))

      if (balance < 0.01 * LAMPORTS_PER_SOL) {
        throw new Error(
          `Insufficient SOL in creator wallet. Balance: ${balanceSOL.toFixed(6)} SOL. Minimum required: 0.01 SOL. Please fund wallet: ${creatorKeypair.publicKey.toString()}`,
        )
      }
    } catch (balanceError) {
      console.error("❌ Balance check failed:", balanceError.message)
      throw balanceError
    }

    // Generate asset signer
    const asset = generateSigner(creatorUmi)
    console.log("🔑 Generated asset address:", asset.publicKey)

    console.log("⚡ Creating NFT with Core (with creator verification)...")

    const basisPoints = Math.max(0, Math.min(10000, Math.round((royaltyPercentage || 0) * 100)))
    console.log("💰 Calculated basis points:", basisPoints)

    const plugins = []

    // Only add royalties plugin if basis points > 0
    if (basisPoints > 0) {
      plugins.push({
        type: "Royalties",
        basisPoints,
        creators: [
          {
            address: creatorUmi.identity.publicKey,
            percentage: 100,
          },
        ],
        ruleSet: { __kind: "None" },
      })
      console.log("✅ Added royalties plugin with", basisPoints, "basis points")
    } else {
      console.log("⚠️ Skipping royalties plugin (0% royalty)")
    }

    // Collections in Metaplex Core need to be verified separately
    // For now, we'll add collection info to metadata attributes only
    if (collectionAddress) {
      console.log("🗂️ Collection address provided:", collectionAddress)
      console.log("⚠️ Note: Collection verification requires separate transaction")
      console.log("📋 Collection info will be added to metadata attributes")
    }

    const createInstruction = create(creatorUmi, {
      asset,
      name: metadata.name,
      uri: metadataUrl,
      owner: publicKey(walletAddress),
      ...(plugins.length > 0 && { plugins }),
    })

    console.log("📡 Submitting transaction to Solana...")
    const result = await createInstruction.sendAndConfirm(creatorUmi, {
      confirm: {
        commitment: "finalized",
      },
      send: {
        skipPreflight: false,
        maxRetries: 3,
      },
    })

    console.log("🎉 NFT minted successfully!")
    console.log("🔗 Asset address:", asset.publicKey)
    console.log("📝 Transaction signature:", result.signature)

    console.log("⏳ Waiting for blockchain indexing (60 seconds)...")
    await new Promise((resolve) => setTimeout(resolve, 60000)) // Increased to 60 seconds

    console.log("🔄 Verifying asset is properly indexed...")
    try {
      const umi = createUmi(RPC_ENDPOINTS[0]).use(mplCore())
      const fetchedAsset = await fetchAsset(umi, asset.publicKey)
      console.log("✅ Asset confirmed and indexed:", fetchedAsset.publicKey)
      console.log("🎨 Asset name:", fetchedAsset.name)
      console.log("📋 Asset URI:", fetchedAsset.uri)
    } catch (indexError) {
      console.log("⚠️ Asset indexing delayed - may take 5-10 minutes to appear in Phantom")
      console.log("📱 Try refreshing your Phantom wallet in a few minutes")
    }

    const explorerUrl = `https://explorer.solana.com/address/${asset.publicKey}${
      SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""
    }`

    return {
      success: true,
      mintAddress: asset.publicKey,
      transactionSignature: result.signature,
      metadataUrl: metadataUrl,
      explorerUrl: explorerUrl,
      method: "core",
      network: SOLANA_NETWORK,
      isImmutable: false,
      note: "Core NFTs may take 1-5 minutes to appear in Phantom wallet due to indexing delays",
    }
  } catch (error) {
    console.error("❌ Core minting failed:", error)
    return {
      success: false,
      error: error.message,
      method: "core",
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
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const { walletAddress, metadata, makeImmutable = true, usePinataUpload: rawUsePinataUpload = true } = req.body

    const usePinataUpload = Boolean(rawUsePinataUpload)

    console.log("🔍 === PINATA UPLOAD PARAMETER DEBUG (SERVER) ===")
    console.log("Raw usePinataUpload from request:", rawUsePinataUpload)
    console.log("Raw usePinataUpload type:", typeof rawUsePinataUpload)
    console.log("Final usePinataUpload (boolean):", usePinataUpload)
    console.log("Storage mode:", usePinataUpload ? "PINATA IPFS" : "WORDPRESS MEDIA")
    console.log("=================================================")

    if (!walletAddress || !metadata || !CREATOR_PRIVATE_KEY) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress, metadata, or CREATOR_PRIVATE_KEY environment variable",
      })
    }

    let creatorKeypair = null
    let creatorUmi = null

    try {
      console.log("🔑 Loading creator wallet from Vercel environment variable...")

      let privateKeyArray
      if (CREATOR_PRIVATE_KEY.startsWith("[")) {
        privateKeyArray = JSON.parse(CREATOR_PRIVATE_KEY)
      } else {
        privateKeyArray = Array.from(bs58.decode(CREATOR_PRIVATE_KEY))
      }

      creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
      console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString())

      const umi = createUmi(RPC_ENDPOINTS[0]).use(mplCore())
      const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
      creatorUmi = umi.use(keypairIdentity(umiKeypair))

      console.log("⚡ Metaplex Core UMI initialized successfully")
    } catch (error) {
      console.error("❌ Error loading creator keypair:", error.message)
      return res.status(500).json({
        success: false,
        error: "Failed to load creator keypair: " + error.message,
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

    // Step 1: Upload WordPress image to IPFS for Phantom wallet compatibility
    console.log("📸 Step 1: Uploading image to IPFS for wallet compatibility...")
    const imageUploadResult = await uploadImageToPinata(metadata.image)

    if (!imageUploadResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to upload image: " + imageUploadResult.error,
      })
    }

    const finalImageUrl = usePinataUpload ? imageUploadResult.url : metadata.image
    console.log("🔍 === IMAGE URL SELECTION DEBUG ===")
    console.log("usePinataUpload flag:", usePinataUpload)
    console.log("Pinata IPFS URL (imageUploadResult.url):", imageUploadResult.url)
    console.log("WordPress Media URL (metadata.image):", metadata.image)
    console.log("SELECTED finalImageUrl:", finalImageUrl)
    console.log("Will use:", usePinataUpload ? "PINATA IPFS" : "WORDPRESS MEDIA")
    console.log("====================================")

    let collectionNumber = null
    const nftName = metadata.nft_name || metadata.name || `NFT #${metadata.product_id || Date.now()}`
    const nftDescription = metadata.nft_description || metadata.description || ""
    const nftSymbol = metadata.symbol || "XENO"
    const productUrl =
      metadata.product_url || metadata.external_url || `https://x1xo.com/product/${metadata.product_slug || "nft"}`
    const royaltyPercentage = Number(metadata.royalty_percentage) || 0
    const collectionName = metadata.collection_name || ""

    if (metadata.collection_number) {
      collectionNumber = Number.parseInt(metadata.collection_number) || null
      console.log(`🔢 Using manual collection number: ${collectionNumber}`)
    }

    console.log(`🔢 FINAL collectionNumber: ${collectionNumber}`)
    console.log(`🏷️ FINAL nftName: "${nftName}"`)
    console.log(`💰 FINAL royaltyPercentage: ${royaltyPercentage}%`)
    console.log(`🔗 FINAL productUrl: ${productUrl}`)
    console.log(`🗂️ FINAL collectionName: "${collectionName}"`)

    const finalMetadata = {
      name: nftName,
      description: nftDescription,
      image: finalImageUrl,
      external_url: productUrl, // keep for backwards compatibility
      links: {
        external_url: productUrl,
        website: productUrl,
      },
      seller_fee_basis_points: Math.round((royaltyPercentage || 0) * 100),
      attributes: [
        ...(collectionName
          ? [
              {
                trait_type: "Collection",
                value: collectionName,
              },
            ]
          : []),
        ...(collectionNumber
          ? [
              {
                trait_type: "Collection #",
                value: collectionNumber.toString(),
              },
            ]
          : []),
        {
          trait_type: "Symbol",
          value: nftSymbol,
        },
        { trait_type: "Platform", value: "WordPress" },
        { trait_type: "Creator", value: "x1xo" },
        { trait_type: "Minted Date", value: new Date().toISOString().split("T")[0] },
        { trait_type: "Storage", value: usePinataUpload ? "IPFS (Pinata)" : "WordPress Media" },
      ],
      properties: {
        files: [
          {
            uri: finalImageUrl,
            type:
              finalImageUrl.includes(".jpg") || finalImageUrl.includes(".jpeg")
                ? "image/jpeg"
                : finalImageUrl.includes(".png")
                  ? "image/png"
                  : finalImageUrl.includes(".webp")
                    ? "image/webp"
                    : "image/jpeg",
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

    // Step 2: Upload metadata to Pinata
    console.log("📤 Step 2: Uploading metadata to Pinata IPFS...")
    const uploadResult = await uploadToPinata(finalMetadata)

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to upload metadata: " + uploadResult.error,
      })
    }

    // Step 3: Mint NFT with Metaplex Core
    console.log("⚡ Step 3: Minting NFT with Core...")
    const mintResult = await mintNFTWithCore(
      walletAddress,
      { name: nftName },
      uploadResult.url,
      creatorKeypair,
      creatorUmi,
      false,
      royaltyPercentage,
      metadata.collection_address || null, // Pass collection address from metadata
    )

    if (!mintResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to mint NFT: " + mintResult.error,
        metadataUrl: uploadResult.url,
      })
    }

    console.log("🎉 === NFT MINTING COMPLETE (CORE) ===")

    res.json({
      success: true,
      mintAddress: mintResult.mintAddress,
      transactionSignature: mintResult.transactionSignature,
      metadataUrl: uploadResult.url,
      imageUrl: finalImageUrl,
      explorerUrl: mintResult.explorerUrl,
      network: SOLANA_NETWORK,
      method: "core",
      isImmutable: mintResult.isImmutable,
      collectionNumber: collectionNumber,
      royaltyPercentage: royaltyPercentage,
      storageType: usePinataUpload ? "ipfs" : "wordpress",
      message: "NFT minted successfully! Check Phantom wallet in 15-30 minutes.",
    })
  } catch (error) {
    console.error("❌ Mint NFT error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
