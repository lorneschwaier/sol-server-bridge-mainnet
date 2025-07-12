// Fix Buffer issues in serverless environment
if (typeof global.Buffer === "undefined") {
  global.Buffer = require("buffer").Buffer
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" })
  }

  try {
    const { walletAddress, metadata } = req.body

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      })
    }

    // Environment variables
    const PINATA_API_KEY = process.env.PINATA_API_KEY
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY
    const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"

    if (!PINATA_API_KEY || !PINATA_SECRET_KEY || !CREATOR_PRIVATE_KEY) {
      return res.status(500).json({
        success: false,
        error: "Missing environment variables",
      })
    }

    // Dynamic imports
    const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults")
    const { createSignerFromKeypair, signerIdentity } = await import("@metaplex-foundation/umi")
    const { createV1, mplCore } = await import("@metaplex-foundation/mpl-core")
    const { generateSigner } = await import("@metaplex-foundation/umi")
    const { fromWeb3JsKeypair } = await import("@metaplex-foundation/umi-web3js-adapters")
    const { Keypair } = await import("@solana/web3.js")
    const axios = (await import("axios")).default
    const bs58 = (await import("bs58")).default

    console.log("🎨 Starting NFT minting process...")
    console.log("   - Wallet:", walletAddress)
    console.log("   - Network:", SOLANA_NETWORK)

    // Upload metadata to Pinata
    console.log("📤 Uploading metadata to Pinata...")

    const pinataResponse = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: metadata,
        pinataMetadata: {
          name: `${metadata.name || "NFT"}_metadata.json`,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
        },
      },
    )

    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`
    console.log("✅ Metadata uploaded:", metadataUrl)

    // Initialize Umi
    const umi = createUmi(SOLANA_RPC_URL).use(mplCore())

    // Parse creator private key
    let privateKeyArray
    if (CREATOR_PRIVATE_KEY.startsWith("[")) {
      privateKeyArray = JSON.parse(CREATOR_PRIVATE_KEY)
    } else {
      privateKeyArray = Array.from(bs58.decode(CREATOR_PRIVATE_KEY))
    }

    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
    const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
    const signer = createSignerFromKeypair(umi, umiKeypair)
    umi.use(signerIdentity(signer))

    console.log("🔑 Creator wallet:", creatorKeypair.publicKey.toString())

    // Generate asset keypair
    const asset = generateSigner(umi)
    console.log("🎯 Asset address:", asset.publicKey)

    // Create NFT with collection guard
    console.log("🎨 Creating NFT...")

    const createResult = await createV1(umi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      uri: metadataUrl,
      owner: walletAddress,
      // Remove collection to prevent buffer.slice error
      // collection: null,
      plugins: [],
    }).sendAndConfirm(umi)

    const signature = bs58.encode(createResult.signature)
    const mintAddress = asset.publicKey

    console.log("✅ NFT minted successfully!")
    console.log("   - Mint Address:", mintAddress)
    console.log("   - Transaction:", signature)

    res.status(200).json({
      success: true,
      mintAddress: mintAddress,
      transactionSignature: signature,
      metadataUrl,
      explorerUrl: `https://explorer.solana.com/address/${mintAddress}?cluster=${SOLANA_NETWORK}`,
      network: SOLANA_NETWORK,
      message: "NFT minted successfully!",
    })
  } catch (error) {
    console.error("❌ Minting error:", error)

    let errorMessage = error.message || "Unknown error occurred"

    // Handle specific errors
    if (errorMessage.includes("buffer.slice is not a function")) {
      errorMessage = "Collection configuration error - using simplified minting"
    } else if (errorMessage.includes("insufficient funds")) {
      errorMessage = "Insufficient SOL for minting fees"
    } else if (errorMessage.includes("Invalid public key")) {
      errorMessage = "Invalid wallet address provided"
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}
