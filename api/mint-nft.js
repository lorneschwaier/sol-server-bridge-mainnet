// Buffer polyfill fix for Vercel ES modules
import { Buffer } from "buffer"
globalThis.Buffer = Buffer

import { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createV1, mplCore } from "@metaplex-foundation/mpl-core"
import { keypairIdentity, generateSigner, publicKey } from "@metaplex-foundation/umi"
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters"
import axios from "axios"
import bs58 from "bs58"
import FormData from "form-data"

// Environment variables
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY

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

    const umi = createUmi(clusterApiUrl("mainnet-beta")).use(mplCore())
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
    const PINATA_API_KEY = process.env.PINATA_API_KEY
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY

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
    const PINATA_API_KEY = process.env.PINATA_API_KEY
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY

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
async function mintNFTWithMetaplexCore(walletAddress, metadata, metadataUrl, umi) {
  try {
    if (!umi) {
      throw new Error("Metaplex Core UMI not initialized - creator private key required")
    }

    console.log("🎨 === STARTING REAL NFT MINT WITH METAPLEX CORE ===")
    console.log("👤 Recipient:", walletAddress)
    console.log("📋 Metadata URL:", metadataUrl)
    console.log("🏷️ NFT Name:", metadata.name)

    console.log("🔍 === DEBUGGING WALLET BALANCE ISSUE ===")
    console.log("🔑 Creator wallet address:", umi.identity.publicKey.toString())

    // Test RPC connection first
    try {
      console.log("🔌 Testing RPC connection...")
      const slot = await umi.rpc.getSlot()
      console.log("✅ RPC connection working, current slot:", slot)
    } catch (rpcError) {
      console.error("❌ RPC connection failed:", rpcError.message)
      throw new Error(`RPC connection failed: ${rpcError.message}`)
    }

    // Try multiple balance checks with different commitment levels
    console.log("💰 Checking wallet balance with different commitment levels...")

    try {
      const balanceFinalized = await umi.rpc.getBalance(umi.identity.publicKey, { commitment: "finalized" })
      console.log("💰 Balance (finalized):", Number(balanceFinalized.basisPoints) / LAMPORTS_PER_SOL, "SOL")

      const balanceConfirmed = await umi.rpc.getBalance(umi.identity.publicKey, { commitment: "confirmed" })
      console.log("💰 Balance (confirmed):", Number(balanceConfirmed.basisPoints) / LAMPORTS_PER_SOL, "SOL")

      const balanceProcessed = await umi.rpc.getBalance(umi.identity.publicKey, { commitment: "processed" })
      console.log("💰 Balance (processed):", Number(balanceProcessed.basisPoints) / LAMPORTS_PER_SOL, "SOL")

      // Use the highest balance found
      const balance = Math.max(
        Number(balanceFinalized.basisPoints),
        Number(balanceConfirmed.basisPoints),
        Number(balanceProcessed.basisPoints),
      )
      console.log("💰 Using highest balance found:", balance / LAMPORTS_PER_SOL, "SOL")

      const accountInfo = await umi.rpc.getAccount(umi.identity.publicKey)
      if (accountInfo.exists) {
        console.log("📊 Account info - lamports:", Number(accountInfo.lamports))
        console.log("📊 Account info - owner:", accountInfo.owner.toString())
        console.log("📊 Account info - executable:", accountInfo.executable)
      } else {
        console.log("❌ Account info not found - wallet might not exist on chain")
      }

      if (balance < 0.01 * LAMPORTS_PER_SOL) {
        throw new Error(
          `Insufficient SOL in creator wallet. Balance: ${balance / LAMPORTS_PER_SOL} SOL. Please fund the wallet: ${umi.identity.publicKey.toString()}. RPC: ${umi.rpc.endpoint}`,
        )
      }

      console.log("✅ Wallet has sufficient balance:", balance / LAMPORTS_PER_SOL, "SOL")
    } catch (balanceError) {
      console.error("❌ Balance check failed:", balanceError.message)
      throw new Error(`Balance check failed: ${balanceError.message}`)
    }

    // Generate asset signer
    const asset = generateSigner(umi)
    console.log("🔑 Generated asset address:", asset.publicKey)

    console.log("⚡ Creating NFT with Metaplex Core...")

    // Create the NFT using Metaplex Core - SIMPLE VERSION WITHOUT PLUGINS
    const createInstruction = createV1(umi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      uri: metadataUrl,
      owner: publicKey(walletAddress),
      // No plugins - keep it simple for now, attributes are in metadata
    })

    // Execute the transaction
    console.log("📡 Submitting transaction to Solana...")
    const result = await createInstruction.sendAndConfirm(umi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: false },
    })

    console.log("🎉 === NFT MINTED SUCCESSFULLY WITH METAPLEX CORE! ===")
    console.log("🔗 Asset address:", asset.publicKey)
    console.log("📝 Transaction signature:", result.signature)

    const explorerUrl = `https://explorer.solana.com/address/${asset.publicKey}${
      umi.cluster === "devnet" ? "?cluster=devnet" : ""
    }`

    return {
      success: true,
      mintAddress: asset.publicKey,
      transactionSignature: result.signature,
      metadataUrl: metadataUrl,
      explorerUrl: explorerUrl,
      method: "metaplex_core",
      network: umi.cluster,
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
    const { walletAddress, metadata, network } = req.body
    const SOLANA_NETWORK = network || process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      SOLANA_NETWORK === "mainnet-beta"
        ? "https://api.mainnet-beta.solana.com"
        : `https://api.${SOLANA_NETWORK}.solana.com`

    console.log("🌐 Using network:", SOLANA_NETWORK)
    console.log("🌐 Using RPC URL:", SOLANA_RPC_URL)

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")
    const umi = createUmi(SOLANA_RPC_URL)
      .use(mplCore())
      .use(keypairIdentity(fromWeb3JsKeypair(creatorKeypair)))

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

    if (metadata.image && !metadata.image.includes("ipfs") && useIPFS) {
      console.log("📸 Step 1: Uploading image to IPFS (user chose decentralized storage)...")
      const imageUploadResult = await uploadImageToPinata(metadata.image)

      if (imageUploadResult.success) {
        finalImageUrl = imageUploadResult.url
        console.log("✅ Image uploaded to IPFS successfully:", finalImageUrl)
      } else {
        console.error("❌ IPFS upload failed, falling back to website image:", imageUploadResult.error)
        finalImageUrl = metadata.image // Keep original website image as fallback
      }
    } else if (!useIPFS) {
      console.log("📸 Using website image (fast option chosen):", finalImageUrl)
    } else {
      console.log("📸 Image already on IPFS or no image provided")
    }

    // Step 2: Create final metadata - MAGIC EDEN COMPATIBLE FORMAT
    const finalMetadata = {
      name: metadata.name || "WordPress NFT",
      symbol: "XENO",
      description: metadata.description || "NFT created via WordPress store",
      image: finalImageUrl,
      external_url: "https://x1xo.com",
      seller_fee_basis_points: 500, // 5% royalty for Magic Eden
      attributes: [
        { trait_type: "Product ID", value: String(metadata.product_id || "unknown") },
        { trait_type: "Platform", value: "WordPress" },
        { trait_type: "Creator", value: "WordPress Store" },
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
    const mintResult = await mintNFTWithMetaplexCore(walletAddress, finalMetadata, uploadResult.url, umi)

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
