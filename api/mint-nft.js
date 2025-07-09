const { createUmi } = require("@metaplex-foundation/umi")
const { web3JsRpc } = require("@metaplex-foundation/umi-rpc-web3js")
const { web3JsEddsa } = require("@metaplex-foundation/umi-eddsa-web3js")
const { mplTokenMetadata, createNft } = require("@metaplex-foundation/mpl-token-metadata")
const { createSignerFromKeypair, signerIdentity, generateSigner } = require("@metaplex-foundation/umi")
const { base58 } = require("@metaplex-foundation/umi/serializers")
const bs58 = require("bs58")

let umi = null
let creatorKeypair = null

async function initializeServices() {
  console.log("🚀 Initializing UMI services for mainnet...")

  try {
    // Get environment variables
    const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY

    if (!CREATOR_PRIVATE_KEY) {
      throw new Error("CREATOR_PRIVATE_KEY environment variable is required")
    }

    console.log("🔗 Using RPC:", RPC_URL)

    // Initialize UMI with correct plugins
    umi = createUmi(RPC_URL).use(web3JsRpc()).use(web3JsEddsa()).use(mplTokenMetadata())

    console.log("✅ UMI initialized successfully")

    // Setup creator keypair
    const privateKeyBytes = bs58.decode(CREATOR_PRIVATE_KEY)
    creatorKeypair = umi.eddsa.createKeypairFromSecretKey(privateKeyBytes)
    const creatorSigner = createSignerFromKeypair(umi, creatorKeypair)

    // Set the creator as the identity
    umi.use(signerIdentity(creatorSigner))

    console.log("✅ Creator keypair configured:", creatorKeypair.publicKey)
    console.log("✅ Services initialized successfully")

    return true
  } catch (error) {
    console.error("❌ Failed to initialize services:", error)
    throw new Error(`UMI initialization failed: ${error.message}`)
  }
}

async function uploadMetadataToIPFS(metadata) {
  console.log("📤 Uploading metadata to IPFS via Pinata...")

  try {
    const PINATA_API_KEY = process.env.PINATA_API_KEY
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY

    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      throw new Error("Pinata API keys not configured")
    }

    const axios = require("axios")

    const response = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadata, {
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    })

    const ipfsHash = response.data.IpfsHash
    const metadataUri = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`

    console.log("✅ Metadata uploaded to IPFS:", metadataUri)
    return metadataUri
  } catch (error) {
    console.error("❌ IPFS upload failed:", error)
    throw new Error(`IPFS upload failed: ${error.message}`)
  }
}

async function mintNFT(walletAddress, metadata) {
  console.log("🎨 Starting NFT minting process...")
  console.log("👤 Recipient:", walletAddress)
  console.log("📋 Metadata:", JSON.stringify(metadata, null, 2))

  try {
    // Upload metadata to IPFS
    const metadataUri = await uploadMetadataToIPFS(metadata)

    // Generate a new mint address
    const mint = generateSigner(umi)
    console.log("🆔 Generated mint address:", mint.publicKey)

    // Create the NFT
    console.log("🔨 Creating NFT on Solana mainnet...")

    const result = await createNft(umi, {
      mint,
      name: metadata.name,
      symbol: metadata.symbol || "NFT",
      uri: metadataUri,
      sellerFeeBasisPoints: metadata.royalty || 0,
      creators: [
        {
          address: creatorKeypair.publicKey,
          verified: true,
          share: 100,
        },
      ],
      tokenOwner: walletAddress,
      tokenStandard: 0, // NonFungible
    }).sendAndConfirm(umi)

    console.log("✅ NFT created successfully!")
    console.log("🔗 Transaction signature:", base58.deserialize(result.signature)[0])

    const mintAddress = mint.publicKey
    const transactionSignature = base58.deserialize(result.signature)[0]

    return {
      success: true,
      mint_address: mintAddress,
      transaction_signature: transactionSignature,
      metadata_uri: metadataUri,
      explorer_url: `https://explorer.solana.com/address/${mintAddress}`,
      transaction_url: `https://explorer.solana.com/tx/${transactionSignature}`,
      network: "mainnet-beta",
    }
  } catch (error) {
    console.error("❌ NFT minting failed:", error)
    throw new Error(`NFT minting failed: ${error.message}`)
  }
}

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST.",
    })
  }

  console.log("🎨 === NFT MINTING REQUEST RECEIVED ===")
  console.log("📋 Request body:", JSON.stringify(req.body, null, 2))

  try {
    // Initialize services if not already done
    if (!umi || !creatorKeypair) {
      console.log("🔄 Initializing services...")
      await initializeServices()
    }

    const { walletAddress, metadata } = req.body

    // Validate input
    if (!walletAddress || !metadata) {
      console.log("❌ Missing required fields")
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      })
    }

    if (!metadata.name || !metadata.image) {
      console.log("❌ Invalid metadata")
      return res.status(400).json({
        success: false,
        error: "Metadata must include name and image",
      })
    }

    console.log("✅ Input validation passed")

    // Mint the NFT
    const result = await mintNFT(walletAddress, metadata)

    console.log("🎉 NFT minting completed successfully!")
    console.log("📋 Final result:", JSON.stringify(result, null, 2))

    res.status(200).json(result)
  } catch (error) {
    console.error("❌ NFT minting error:", error)
    console.error("❌ Stack trace:", error.stack)

    res.status(500).json({
      success: false,
      error: `Failed to initialize minting services - ${error.message}`,
    })
  }
}
