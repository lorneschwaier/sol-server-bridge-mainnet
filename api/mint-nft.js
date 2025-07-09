const { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } = require("@solana/web3.js")

const {
  createUmi,
  generateSigner,
  signerIdentity,
  publicKey,
  createSignerFromKeypair,
} = require("@metaplex-foundation/umi")

const { web3JsRpc } = require("@metaplex-foundation/umi-rpc-web3js")
const { web3JsEddsa } = require("@metaplex-foundation/umi-eddsa-web3js")
const { mplTokenMetadata, createNft } = require("@metaplex-foundation/mpl-token-metadata")

const bs58 = require("bs58")
const axios = require("axios")

// FINAL FIX: July 9, 2025 - Correct UMI initialization
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY
const CREATOR_WALLET = process.env.CREATOR_WALLET
const PINATA_API_KEY = process.env.PINATA_API_KEY
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY
const API_KEY = process.env.API_KEY

let connection
let umi
let signer

function initializeServices() {
  try {
    console.log("🔧 FINAL FIX: Initializing services with correct UMI setup...")
    console.log("🔧 Environment check:")
    console.log("- Network:", process.env.SOLANA_NETWORK || "mainnet-beta")
    console.log("- RPC_URL:", RPC_URL ? "✅ Set" : "❌ Missing")
    console.log("- CREATOR_WALLET:", CREATOR_WALLET ? "✅ Set" : "❌ Missing")
    console.log("- CREATOR_PRIVATE_KEY:", CREATOR_PRIVATE_KEY ? "✅ Set" : "❌ Missing")
    console.log("- PINATA_API_KEY:", PINATA_API_KEY ? "✅ Set" : "❌ Missing")
    console.log("- PINATA_SECRET_KEY:", PINATA_SECRET_KEY ? "✅ Set" : "❌ Missing")

    if (!CREATOR_PRIVATE_KEY) {
      throw new Error("CREATOR_PRIVATE_KEY environment variable is required")
    }

    if (!RPC_URL) {
      throw new Error("SOLANA_RPC_URL environment variable is required")
    }

    // Initialize Solana connection
    connection = new Connection(RPC_URL, "confirmed")
    console.log("✅ Solana connection initialized")

    // Parse private key
    let secretArray
    if (CREATOR_PRIVATE_KEY.startsWith("[")) {
      secretArray = JSON.parse(CREATOR_PRIVATE_KEY)
    } else {
      secretArray = Array.from(bs58.decode(CREATOR_PRIVATE_KEY))
    }

    // FINAL FIX: Initialize UMI with correct plugins
    console.log("🔧 FINAL FIX: Initializing UMI with web3JsRpc and web3JsEddsa...")
    umi = createUmi(RPC_URL).use(web3JsRpc()).use(web3JsEddsa()).use(mplTokenMetadata())

    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretArray))
    signer = createSignerFromKeypair(umi, umiKeypair)
    umi.use(signerIdentity(signer))

    console.log("✅ FINAL FIX: UMI initialized successfully")
    console.log("✅ UMI signer ready:", signer.publicKey.toString())
    console.log("✅ Creator wallet:", CREATOR_WALLET)

    if (CREATOR_WALLET && signer.publicKey.toString() !== CREATOR_WALLET) {
      console.warn("⚠️ Warning: Signer public key doesn't match CREATOR_WALLET")
    }

    return true
  } catch (error) {
    console.error("❌ Failed to initialize services:", error.message)
    console.error("❌ Stack trace:", error.stack)
    return false
  }
}

async function uploadToPinata(metadata) {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    console.log("⚠️ No Pinata keys - using data URL for metadata")
    const metadataJson = JSON.stringify(metadata)
    const dataUrl = `data:application/json;base64,${Buffer.from(metadataJson).toString("base64")}`
    return dataUrl
  }

  try {
    console.log("📋 Uploading metadata to Pinata")

    const response = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadata, {
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
      timeout: 30000,
    })

    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`
    console.log("✅ Metadata uploaded to Pinata:", metadataUrl)
    return metadataUrl
  } catch (error) {
    console.error("❌ Pinata upload failed, using data URL:", error.message)
    const metadataJson = JSON.stringify(metadata)
    const dataUrl = `data:application/json;base64,${Buffer.from(metadataJson).toString("base64")}`
    return dataUrl
  }
}

module.exports = async (req, res) => {
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
    console.log("🎨 FINAL FIX: Starting NFT minting process...")
    console.log("📋 Request body:", JSON.stringify(req.body, null, 2))

    const { walletAddress, metadata } = req.body

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing walletAddress or metadata",
      })
    }

    try {
      new PublicKey(walletAddress)
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address",
      })
    }

    if (!umi || !signer) {
      console.log("🔧 Services not initialized, initializing now...")
      const initialized = initializeServices()
      if (!initialized) {
        return res.status(500).json({
          success: false,
          error: "Failed to initialize minting services - UMI initialization failed",
        })
      }
    }

    const creatorBalance = await connection.getBalance(new PublicKey(signer.publicKey.toString()))
    const requiredBalance = 0.01 * LAMPORTS_PER_SOL

    if (creatorBalance < requiredBalance) {
      return res.status(400).json({
        success: false,
        error: `Insufficient SOL in creator wallet. Required: 0.01 SOL, Available: ${creatorBalance / LAMPORTS_PER_SOL} SOL`,
      })
    }

    console.log(`✅ Creator wallet balance: ${creatorBalance / LAMPORTS_PER_SOL} SOL`)

    const fullMetadata = {
      name: metadata.name || "Untitled NFT",
      symbol: metadata.symbol || "NFT",
      description: metadata.description || "",
      image: metadata.image || "",
      seller_fee_basis_points: Math.floor((metadata.royalty || 0) * 100),
      external_url: metadata.external_url || "",
      attributes: metadata.attributes || [],
      properties: {
        creators: [
          {
            address: signer.publicKey.toString(),
            share: 100,
          },
        ],
        files: metadata.image
          ? [
              {
                uri: metadata.image,
                type: "image/png",
              },
            ]
          : [],
      },
    }

    console.log("📋 Full metadata prepared:", JSON.stringify(fullMetadata, null, 2))

    const metadataUri = await uploadToPinata(fullMetadata)

    const mint = generateSigner(umi)
    const owner = publicKey(walletAddress)

    console.log("🔨 Creating NFT transaction...")
    console.log("- Mint address:", mint.publicKey.toString())
    console.log("- Owner:", walletAddress)
    console.log("- Metadata URI:", metadataUri)

    const createNftInstruction = createNft(umi, {
      mint,
      name: fullMetadata.name,
      symbol: fullMetadata.symbol,
      uri: metadataUri,
      sellerFeeBasisPoints: fullMetadata.seller_fee_basis_points,
      creators: [
        {
          address: signer.publicKey,
          verified: true,
          share: 100,
        },
      ],
      tokenOwner: owner,
      updateAuthority: signer,
      mintAuthority: signer,
      payer: signer,
      isMutable: true,
    })

    console.log("📡 Sending transaction to Solana...")
    const result = await createNftInstruction.sendAndConfirm(umi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: false },
    })

    const mintAddress = mint.publicKey.toString()
    const signature = bs58.encode(result.signature)

    console.log("✅ NFT minted successfully!")
    console.log("- Mint Address:", mintAddress)
    console.log("- Transaction:", signature)

    return res.status(200).json({
      success: true,
      mint_address: mintAddress,
      transaction_signature: signature,
      metadata_uri: metadataUri,
      explorer_url: `https://explorer.solana.com/address/${mintAddress}?cluster=mainnet-beta`,
      transaction_url: `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`,
      message: "NFT minted successfully on Solana mainnet!",
      creator_wallet: CREATOR_WALLET,
      network: process.env.SOLANA_NETWORK || "mainnet-beta",
      final_fix: "UMI initialization corrected - July 9, 2025",
    })
  } catch (error) {
    console.error("❌ NFT minting error:", error)
    console.error("❌ Error stack:", error.stack)

    let errorMessage = error.message || "Unknown error occurred"
    let errorCode = 500

    if (error.message?.includes("insufficient funds")) {
      errorMessage = "Insufficient funds in creator wallet"
      errorCode = 400
    } else if (error.message?.includes("blockhash")) {
      errorMessage = "Transaction failed due to network issues. Please try again."
      errorCode = 503
    } else if (error.message?.includes("timeout")) {
      errorMessage = "Request timeout. Please try again."
      errorCode = 504
    } else if (error.message?.includes("environment variable")) {
      errorMessage = "Server configuration error - missing environment variables"
      errorCode = 500
    }

    return res.status(errorCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      final_fix: "UMI initialization corrected - July 9, 2025",
    })
  }
}
