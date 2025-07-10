const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = require("@solana/web3.js")
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults")
const { createV1, mplCore } = require("@metaplex-foundation/mpl-core")
const { keypairIdentity, generateSigner, publicKey, some, none } = require("@metaplex-foundation/umi")
const { fromWeb3JsKeypair } = require("@metaplex-foundation/umi-web3js-adapters")
const axios = require("axios")
const bs58 = require("bs58")

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
    // Parse private key (handle both JSON array and base58 formats)
    let privateKeyArray
    if (CREATOR_PRIVATE_KEY.startsWith("[")) {
      privateKeyArray = JSON.parse(CREATOR_PRIVATE_KEY)
    } else {
      privateKeyArray = Array.from(bs58.decode(CREATOR_PRIVATE_KEY))
    }

    // Create Web3.js keypair
    creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))

    // Initialize UMI with Metaplex Core
    const umi = createUmi(SOLANA_RPC_URL).use(mplCore())

    // Convert Web3.js keypair to UMI keypair
    const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
    creatorUmi = umi.use(keypairIdentity(umiKeypair))
  } catch (error) {
    console.error("❌ Error loading creator keypair:", error.message)
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

    // Check creator wallet balance
    const balance = await connection.getBalance(creatorKeypair.publicKey)
    console.log("💰 Creator wallet balance:", balance / LAMPORTS_PER_SOL, "SOL")

    if (balance < 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(
        `Insufficient SOL in creator wallet. Balance: ${balance / LAMPORTS_PER_SOL} SOL. Please fund the wallet.`,
      )
    }

    // Generate asset signer
    const asset = generateSigner(creatorUmi)
    console.log("🔑 Generated asset address:", asset.publicKey)

    // Prepare collection (if provided)
    let collectionConfig = none()
    if (metadata.collection && metadata.collection.trim()) {
      try {
        const collectionPubkey = publicKey(metadata.collection.trim())
        collectionConfig = some({ key: collectionPubkey, verified: false })
        console.log("📁 Collection configured:", metadata.collection)
      } catch (error) {
        console.log("⚠️ Invalid collection address, proceeding without collection")
      }
    }

    console.log("⚡ Creating NFT with Metaplex Core...")

    // Create the NFT using Metaplex Core
    const createInstruction = createV1(creatorUmi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      uri: metadataUrl,
      collection: collectionConfig,
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

    const explorerUrl = `https://explorer.solana.com/address/${asset.publicKey}${SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""}`

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
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

    // Step 1: Upload metadata to IPFS
    console.log("📤 Step 1: Uploading metadata...")
    const uploadResult = await uploadToPinata(metadata)

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to upload metadata: " + uploadResult.error,
      })
    }

    // Step 2: Mint NFT with Metaplex Core
    console.log("⚡ Step 2: Minting NFT with Metaplex Core...")
    const mintResult = await mintNFTWithMetaplexCore(walletAddress, metadata, uploadResult.url)

    if (!mintResult.success) {
      return res.status(500).json({
        success: false,
        error: "Failed to mint NFT: " + mintResult.error,
        metadataUrl: uploadResult.url, // At least metadata was uploaded
      })
    }

    console.log("🎉 === NFT MINTING COMPLETE (METAPLEX CORE) ===")

    res.json({
      success: true,
      mintAddress: mintResult.mintAddress,
      transactionSignature: mintResult.transactionSignature,
      metadataUrl: uploadResult.url,
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
