// Buffer polyfill fix for Vercel ES modules
import { Buffer } from "buffer"
globalThis.Buffer = Buffer

import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { create, mplCore, ruleSet, fetchAsset, updateV1 } from "@metaplex-foundation/mpl-core"
import { keypairIdentity, generateSigner, publicKey } from "@metaplex-foundation/umi"
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters"
import bs58 from "bs58"

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

const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY

// Real NFT Minting with Metaplex Core
async function mintNFTWithCore(walletAddress, metadata, metadataUrl, creatorKeypair, creatorUmi, makeImmutable = true) {
  try {
    if (!creatorUmi) {
      throw new Error("Metaplex Core UMI not initialized - creator private key required")
    }

    console.log(`🎨 === STARTING ${makeImmutable ? "IMMUTABLE" : "MUTABLE"} NFT MINT WITH CORE ===`)
    console.log("👤 Recipient:", walletAddress)
    console.log("📋 Metadata URL:", metadataUrl)
    console.log("🏷️ NFT Name:", metadata.name)
    console.log("🔒 Make Immutable:", makeImmutable)

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

    const collectionNumber = metadata.collection_number || 10

    console.log("🎨 === STARTING REAL NFT MINT WITH CORE ===")
    console.log("👤 Recipient:", walletAddress)
    console.log("📋 Metadata URL:", metadataUrl)
    console.log("🏷️ NFT Name:", metadata.name)
    console.log("🔢 Collection Number:", collectionNumber)

    const createInstruction = create(creatorUmi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      uri: metadataUrl,
      owner: publicKey(walletAddress),
      plugins: [
        {
          type: "Royalties",
          basisPoints: 300,
          creators: [
            {
              address: creatorUmi.identity.publicKey,
              percentage: 100,
            },
          ],
          ruleSet: ruleSet("None"),
        },
      ],
    })

    console.log("📡 Submitting transaction to Solana...")
    const result = await createInstruction.sendAndConfirm(creatorUmi, {
      confirm: { commitment: "confirmed" }, // Changed from finalized to confirmed for faster response
      send: { skipPreflight: false },
    })

    console.log("✅ NFT creation transaction confirmed:", result.signature)

    let immutableSignature = null

    if (makeImmutable) {
      console.log("🔒 Making NFT permanently immutable...")
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000)) // Reduced from 3000ms

        const immutableResult = await updateV1(creatorUmi, {
          asset: asset.publicKey,
          newUpdateAuthority: null, // Remove update authority completely
        }).sendAndConfirm(creatorUmi, {
          confirm: { commitment: "confirmed" },
        })

        immutableSignature = immutableResult.signature
        console.log("✅ NFT is now PERMANENTLY IMMUTABLE - no one can ever change it")
        console.log("🔒 Immutable transaction:", immutableSignature)
      } catch (immutableError) {
        console.log("⚠️ Could not remove update authority, but NFT is still minted:", immutableError.message)
      }
    } else {
      console.log("🔓 NFT remains mutable - creator can update metadata")
    }

    console.log("🎉 === NFT MINTED SUCCESSFULLY WITH CORE! ===")
    console.log("🔗 Asset address:", asset.publicKey)
    console.log("📝 Transaction signature:", result.signature)

    console.log("✅ Core NFT minted, waiting for indexing...")
    await new Promise((resolve) => setTimeout(resolve, 10000)) // Reduced from 30000ms

    console.log("🔄 Checking if asset is indexed...")
    try {
      const umi = createUmi(RPC_ENDPOINTS[0]).use(mplCore())
      const fetchedAsset = await fetchAsset(umi, asset.publicKey)
      console.log("✅ Asset confirmed indexed:", fetchedAsset.publicKey)
      console.log("📋 Asset name:", fetchedAsset.name)
      console.log("👤 Asset owner:", fetchedAsset.owner)
    } catch (indexError) {
      console.log("⚠️ Asset not yet indexed, may take more time to appear in wallets:", indexError.message)
    }

    const explorerUrl = `https://explorer.solana.com/address/${asset.publicKey}${
      SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""
    }`

    return {
      success: true,
      mintAddress: asset.publicKey,
      transactionSignature: result.signature,
      immutableSignature: immutableSignature,
      metadataUrl: metadataUrl,
      explorerUrl: explorerUrl,
      collectionNumber: collectionNumber,
      method: "core",
      network: SOLANA_NETWORK,
      isImmutable: makeImmutable,
      note: "Core NFTs may take 1-5 minutes to appear in Phantom wallet due to indexing delays",
    }
  } catch (error) {
    console.error("❌ Core minting failed:", error)
    console.error("❌ Error details:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    })
    return {
      success: false,
      error: error.message,
      method: "core",
      errorDetails: error.stack,
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
    const { walletAddress, metadata, makeImmutable = true } = req.body

    console.log("🎨 === REAL NFT MINTING REQUEST (CORE) ===")
    console.log("👤 Wallet:", walletAddress)
    console.log("🔒 Make Immutable:", makeImmutable)
    console.log("📋 Metadata:", JSON.stringify(metadata, null, 2))
    console.log("🔑 Creator private key from Vercel env:", CREATOR_PRIVATE_KEY ? "Yes" : "No")
    console.log("🏗️ Image hosting method: X1XO WordPress Media (hosted on x1xo.com)")

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

    console.log("📸 Using X1XO WordPress media hosting (no upload needed)...")
    const finalImageUrl = metadata.image
    console.log("✅ Image URL from WordPress media:", finalImageUrl)

    const collectionNumber = metadata.collection_number || 10

    const enhancedMetadata = {
      name: metadata.name || "WordPress NFT",
      symbol: "XENO",
      description: metadata.description || "NFT created via WordPress",
      image: finalImageUrl,
      external_url: metadata.product_url || `https://x1xo.com/product/${metadata.product_slug || "nft"}`,
      attributes: [
        {
          trait_type: "Collection #",
          value: collectionNumber,
        },
        {
          trait_type: "Creator",
          value: "x1xo.com",
        },
        {
          trait_type: "Website",
          value: "https://x1xo.com",
        },
      ],
    }

    console.log("📋 Enhanced metadata with traits:", JSON.stringify(enhancedMetadata, null, 2))

    const metadataJson = JSON.stringify(enhancedMetadata)
    const metadataUrl = `data:application/json;base64,${Buffer.from(metadataJson).toString("base64")}`
    console.log("✅ Enhanced metadata created as data URI (size:", metadataJson.length, "bytes)")

    // Mint NFT with Metaplex Core
    console.log("⚡ Minting NFT with Core...")
    const mintResult = await mintNFTWithCore(
      walletAddress,
      enhancedMetadata,
      metadataUrl,
      creatorKeypair,
      creatorUmi,
      makeImmutable,
    )

    if (!mintResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to mint NFT: " + mintResult.error,
        metadataUrl: metadataUrl,
      })
    }

    console.log("🎉 === NFT MINTING COMPLETE (CORE) ===")

    res.json({
      success: true,
      mintAddress: mintResult.mintAddress,
      transactionSignature: mintResult.transactionSignature,
      immutableSignature: mintResult.immutableSignature,
      metadataUrl: metadataUrl,
      imageUrl: finalImageUrl,
      explorerUrl: mintResult.explorerUrl,
      network: SOLANA_NETWORK,
      method: "core",
      isImmutable: makeImmutable,
      mutabilityChoice: makeImmutable ? "Permanently Immutable" : "Creator Updatable",
      message: makeImmutable
        ? "NFT minted and permanently locked - no one can ever change it"
        : "NFT minted as updatable - creator retains ability to modify metadata",
      collectionNumber: mintResult.collectionNumber,
      hostingMethod: "X1XO WordPress Media",
    })
  } catch (error) {
    console.error("❌ Mint NFT error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
