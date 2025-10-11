// Buffer polyfill fix for Vercel ES modules
import { Buffer } from "buffer"
globalThis.Buffer = Buffer

import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { create, mplCore, fetchAsset } from "@metaplex-foundation/mpl-core"
import { keypairIdentity, generateSigner, publicKey } from "@metaplex-foundation/umi"
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters"
import bs58 from "bs58"
import FormData from "form-data"

// Environment variables
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
const PINATA_JWT = process.env.PINATA_JWT // Added PINATA_JWT variable
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
    console.log("📤 Uploading image to Pinata IPFS...")
    console.log("🖼️ Image URL:", imageUrl)

    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    }

    const imageBuffer = await response.arrayBuffer()
    const blob = new Blob([imageBuffer])

    const data = new FormData()
    data.append("file", blob, "nft-image.jpg")

    const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: data,
    })

    if (!pinataResponse.ok) {
      const errorText = await pinataResponse.text()
      throw new Error(`Pinata upload failed: ${errorText}`)
    }

    const result = await pinataResponse.json()
    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`

    console.log("✅ Image uploaded to Pinata IPFS")
    console.log("🔗 IPFS URL:", ipfsUrl)

    return {
      success: true,
      url: ipfsUrl,
      ipfsHash: result.IpfsHash,
    }
  } catch (error) {
    console.error("❌ Pinata image upload error:", error)
    return {
      success: false,
      error: error.message,
    }
  }
}

// Upload metadata to Pinata
async function uploadToPinata(metadata) {
  try {
    console.log("📤 Uploading metadata to Pinata IPFS...")

    const pinataResponse = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: metadata,
        pinataMetadata: {
          name: `${metadata.name}-metadata.json`,
        },
      }),
    })

    if (!pinataResponse.ok) {
      const errorText = await pinataResponse.text()
      throw new Error(`Pinata upload failed: ${errorText}`)
    }

    const result = await pinataResponse.json()
    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`

    console.log("✅ Metadata uploaded to Pinata IPFS")
    console.log("🔗 Metadata URL:", metadataUrl)
    console.log("📋 IPFS Hash:", result.IpfsHash)

    return {
      success: true,
      url: metadataUrl,
      ipfsHash: result.IpfsHash,
    }
  } catch (error) {
    console.error("❌ Pinata metadata upload error:", error)
    return {
      success: false,
      error: error.message,
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

    // Collection metadata is handled in the JSON metadata, not as a plugin

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
    const { walletAddress, metadata, makeImmutable = true, usePinataUpload = true } = req.body

    console.log("🔍 === PINATA UPLOAD PARAMETER DEBUG (SERVER) ===")
    console.log("Full request body:", JSON.stringify(req.body, null, 2))
    console.log("usePinataUpload from request:", usePinataUpload)
    console.log("usePinataUpload type:", typeof usePinataUpload)
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
    let finalImageUrl = metadata.image // Default to WordPress URL

    if (usePinataUpload) {
      console.log("📸 Uploading image to Pinata IPFS...")
      const imageUploadResult = await uploadImageToPinata(metadata.image)

      if (!imageUploadResult.success) {
        return res.status(500).json({
          success: false,
          error: "Failed to upload image: " + imageUploadResult.error,
        })
      }

      finalImageUrl = imageUploadResult.url
      console.log("✅ Image uploaded to Pinata:", finalImageUrl)
    } else {
      console.log("📸 Using WordPress Media URL:", finalImageUrl)
    }

    console.log("🔍 === IMAGE URL SELECTION DEBUG ===")
    console.log("usePinataUpload flag:", usePinataUpload)
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

    if (metadata.collection_number) {
      collectionNumber = Number.parseInt(metadata.collection_number) || null
      console.log(`🔢 Using manual collection number: ${collectionNumber}`)
    }

    console.log(`🔢 FINAL collectionNumber: ${collectionNumber}`)
    console.log(`🏷️ FINAL nftName: "${nftName}"`)
    console.log(`💰 FINAL royaltyPercentage: ${royaltyPercentage}%`)
    console.log(`🔗 FINAL productUrl: ${productUrl}`)

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
