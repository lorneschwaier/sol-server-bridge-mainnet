const { Connection, Keypair, LAMPORTS_PER_SOL, clusterApiUrl, PublicKey } = require("@solana/web3.js")

const {
  createUmi,
  generateSigner,
  signerIdentity,
  publicKey,
  createSignerFromKeypair,
} = require("@metaplex-foundation/umi")

const { mplTokenMetadata, createNft } = require("@metaplex-foundation/mpl-token-metadata")

const bs58 = require("bs58")
const axios = require("axios")
const FormData = require("form-data")

// Configuration
const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta")
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY
const COLLECTION_MINT_ADDRESS = process.env.COLLECTION_MINT_ADDRESS
const PINATA_API_KEY = process.env.PINATA_API_KEY
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY

let connection
let umi
let signer

function initializeServices() {
  try {
    console.log("🔧 Initializing services...")

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

    // Initialize UMI
    umi = createUmi(RPC_URL).use(mplTokenMetadata())
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretArray))
    signer = createSignerFromKeypair(umi, umiKeypair)
    umi.use(signerIdentity(signer))

    console.log("✅ UMI signer ready:", signer.publicKey.toString())
    return true
  } catch (error) {
    console.error("❌ Failed to initialize services:", error)
    return false
  }
}

async function uploadImageToPinata(imageUrl) {
  try {
    console.log("📸 Uploading image to Pinata:", imageUrl)

    const response = await axios.get(imageUrl, {
      responseType: "stream",
      timeout: 30000,
    })

    const ext = imageUrl.split(".").pop().split("?")[0] || "png"
    const fileName = `nft-image-${Date.now()}.${ext}`

    const form = new FormData()
    form.append("file", response.data, {
      filename: fileName,
      contentType: response.headers["content-type"] || "image/png",
    })

    form.append(
      "pinataMetadata",
      JSON.stringify({
        name: fileName,
      }),
    )

    const uploadResponse = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
      headers: {
        ...form.getHeaders(),
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
      timeout: 60000,
    })

    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${uploadResponse.data.IpfsHash}`
    console.log("✅ Image uploaded to IPFS:", ipfsUrl)
    return ipfsUrl
  } catch (error) {
    console.error("❌ Image upload failed:", error)
    throw new Error(`Image upload failed: ${error.message}`)
  }
}

async function uploadMetadataToPinata(metadata) {
  try {
    console.log("📋 Uploading metadata to Pinata")

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
    console.log("✅ Metadata uploaded to IPFS:", metadataUrl)
    return metadataUrl
  } catch (error) {
    console.error("❌ Metadata upload failed:", error)
    throw new Error(`Metadata upload failed: ${error.message}`)
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
    console.log("🎨 Starting NFT minting process...")
    console.log("📋 Request body:", JSON.stringify(req.body, null, 2))

    // Validate request body
    const { walletAddress, metadata } = req.body

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing walletAddress or metadata",
      })
    }

    // Validate wallet address
    try {
      new PublicKey(walletAddress)
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address",
      })
    }

    // Initialize services if not already done
    if (!umi || !signer) {
      const initialized = initializeServices()
      if (!initialized) {
        return res.status(500).json({
          success: false,
          error: "Failed to initialize minting services",
        })
      }
    }

    // Check creator wallet balance
    const creatorBalance = await connection.getBalance(new PublicKey(signer.publicKey.toString()))
    const requiredBalance = 0.01 * LAMPORTS_PER_SOL // 0.01 SOL minimum

    if (creatorBalance < requiredBalance) {
      return res.status(400).json({
        success: false,
        error: `Insufficient SOL in creator wallet. Required: 0.01 SOL, Available: ${creatorBalance / LAMPORTS_PER_SOL} SOL`,
      })
    }

    console.log(`✅ Creator wallet balance: ${creatorBalance / LAMPORTS_PER_SOL} SOL`)

    // Process image upload
    let imageUrl = metadata.image
    if (metadata.image && metadata.image.startsWith("http")) {
      imageUrl = await uploadImageToPinata(metadata.image)
    }

    // Prepare full metadata
    const fullMetadata = {
      name: metadata.name || "Untitled NFT",
      symbol: metadata.symbol || "NFT",
      description: metadata.description || "",
      image: imageUrl,
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
        files: [
          {
            uri: imageUrl,
            type: "image/png",
          },
        ],
      },
    }

    console.log("📋 Full metadata prepared:", JSON.stringify(fullMetadata, null, 2))

    // Upload metadata to IPFS
    const metadataUri = await uploadMetadataToPinata(fullMetadata)

    // Generate mint keypair
    const mint = generateSigner(umi)
    const owner = publicKey(walletAddress)

    // Prepare collection (if specified)
    const collection = COLLECTION_MINT_ADDRESS ? publicKey(COLLECTION_MINT_ADDRESS) : undefined

    console.log("🔨 Creating NFT transaction...")
    console.log("- Mint address:", mint.publicKey.toString())
    console.log("- Owner:", walletAddress)
    console.log("- Metadata URI:", metadataUri)

    // Create and send NFT transaction
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
      collection: collection
        ? {
            key: collection,
            verified: false,
          }
        : undefined,
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
    })
  } catch (error) {
    console.error("❌ NFT minting error:", error)

    // Provide detailed error information
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
    }

    return res.status(errorCode).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    })
  }
}
