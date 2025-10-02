import { Connection, Keypair } from "@solana/web3.js"
import { create } from "@metaplex-foundation/mpl-core"
import { generateSigner, signerIdentity } from "@metaplex-foundation/umi"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys"
import bs58 from "bs58"

const CREATOR_PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY
const RPC_ENDPOINTS = [
  process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.g.alchemy.com/v2/demo",
  "https://api.mainnet-beta.solana.com",
]

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const { metadata, buyerWallet } = req.body

    if (!metadata || !buyerWallet) {
      return res.status(400).json({ error: "Missing required fields: metadata and buyerWallet" })
    }

    console.log("[v0] Received metadata:", JSON.stringify(metadata, null, 2))

    let collectionNumber = null
    if (metadata.collection_number) {
      collectionNumber = Number.parseInt(metadata.collection_number)
      console.log(`[v0] Using collection number: ${collectionNumber}`)
    }

    let royaltyPercentage = 0
    if (metadata.royalty_percentage) {
      royaltyPercentage = Number.parseFloat(metadata.royalty_percentage)
      console.log(`[v0] Using royalty percentage: ${royaltyPercentage}%`)
    }
    const sellerFeeBasisPoints = Math.round(royaltyPercentage * 100)

    let nftName = metadata.name || "NFT"
    // Remove any existing #number pattern from the name
    nftName = nftName.replace(/\s*#\d+\s*$/, "").trim()

    if (collectionNumber) {
      nftName = `${nftName} #${collectionNumber}`
    }

    console.log(`[v0] Final NFT name: ${nftName}`)

    const nftSymbol = metadata.symbol || "XENO"
    const nftDescription = metadata.description || "Minted via WordPress"

    const imageUrl = metadata.image
    if (!imageUrl) {
      return res.status(400).json({ error: "Missing image URL" })
    }

    // Detect actual file type from URL
    const imageExtension = imageUrl.split(".").pop().toLowerCase()
    let imageType = "image/png"
    if (imageExtension === "webp") {
      imageType = "image/webp"
    } else if (imageExtension === "jpg" || imageExtension === "jpeg") {
      imageType = "image/jpeg"
    }
    console.log(`[v0] Detected image type: ${imageType}`)

    // Initialize Solana connection with fallback
    let connection = null
    let rpcUrl = null

    for (const endpoint of RPC_ENDPOINTS) {
      try {
        const testConnection = new Connection(endpoint, "confirmed")
        await testConnection.getLatestBlockhash()
        connection = testConnection
        rpcUrl = endpoint
        console.log(`[v0] Connected to RPC: ${endpoint}`)
        break
      } catch (error) {
        console.log(`[v0] Failed to connect to ${endpoint}, trying next...`)
      }
    }

    if (!connection) {
      throw new Error("Failed to connect to any Solana RPC endpoint")
    }

    // Initialize creator keypair
    if (!CREATOR_PRIVATE_KEY) {
      throw new Error("SOLANA_PRIVATE_KEY environment variable not set")
    }

    const creatorKeypair = Keypair.fromSecretKey(bs58.decode(CREATOR_PRIVATE_KEY))
    const creatorPublicKey = creatorKeypair.publicKey.toString()
    console.log(`[v0] Creator wallet: ${creatorPublicKey}`)

    // Check creator balance
    const balance = await connection.getBalance(creatorKeypair.publicKey)
    console.log(`[v0] Creator balance: ${balance / 1e9} SOL`)

    if (balance < 0.01 * 1e9) {
      throw new Error(`Insufficient balance. Current: ${balance / 1e9} SOL, Required: ~0.01 SOL`)
    }

    // Initialize UMI
    const umi = createUmi(rpcUrl)
      .use(signerIdentity(createUmiKeypair(creatorKeypair)))
      .use(irysUploader())

    const nftMetadata = {
      name: nftName,
      symbol: nftSymbol,
      description: nftDescription,
      image: imageUrl,
      external_url: metadata.product_url || metadata.external_url,
      seller_fee_basis_points: sellerFeeBasisPoints,
      attributes: [],
      properties: {
        files: [
          {
            uri: imageUrl,
            type: imageType, // Use detected file type
          },
        ],
        category: "image",
        creators: [
          {
            address: creatorPublicKey,
            verified: true, // Always set verified to true
            share: 100,
          },
        ],
      },
    }

    if (collectionNumber) {
      nftMetadata.attributes.push({
        trait_type: "Collection #",
        value: collectionNumber.toString(),
      })
    }

    // Add other attributes
    nftMetadata.attributes.push(
      { trait_type: "Creator", value: "x1xo.com" },
      { trait_type: "Platform", value: "WordPress" },
      { trait_type: "Minted Date", value: new Date().toISOString().split("T")[0] },
    )

    console.log("[v0] Final metadata:", JSON.stringify(nftMetadata, null, 2))

    // Upload metadata to Arweave via Irys
    console.log("[v0] Uploading metadata to Arweave...")
    const metadataUri = await umi.uploader.uploadJson(nftMetadata)
    console.log(`[v0] Metadata uploaded: ${metadataUri}`)

    // Generate asset signer
    const assetSigner = generateSigner(umi)
    console.log(`[v0] Generated asset address: ${assetSigner.publicKey}`)

    // Create the NFT
    console.log("[v0] Creating NFT...")
    const tx = await create(umi, {
      asset: assetSigner,
      name: nftName,
      uri: metadataUri,
      owner: buyerWallet,
      plugins: [],
    }).sendAndConfirm(umi)

    console.log(`[v0] NFT minted successfully!`)
    console.log(`[v0] Asset ID: ${assetSigner.publicKey}`)
    console.log(`[v0] Transaction: ${bs58.encode(tx.signature)}`)

    return res.status(200).json({
      success: true,
      assetId: assetSigner.publicKey,
      signature: bs58.encode(tx.signature),
      metadata: nftMetadata,
      metadataUri,
    })
  } catch (error) {
    console.error("[v0] Minting error:", error)
    return res.status(500).json({
      error: error.message,
      details: error.toString(),
    })
  }
}

function createUmiKeypair(keypair) {
  return {
    publicKey: Array.from(keypair.publicKey.toBytes()),
    secretKey: Array.from(keypair.secretKey),
  }
}
