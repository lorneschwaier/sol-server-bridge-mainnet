import { Connection, PublicKey } from "@solana/web3.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { mplCore } from "@metaplex-foundation/mpl-core"
import { generateSigner, keypairIdentity } from "@metaplex-foundation/umi"
import { base58 } from "@metaplex-foundation/umi/serializers"
import axios from "axios"
import { createV1 } from "@metaplex-foundation/mpl-token-metadata" // Import createV1

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" })
  }

  try {
    const { walletAddress, nftName, nftDescription, imageUrl, collectionAddress, attributes = [] } = req.body

    // Validate required fields
    if (!walletAddress || !nftName || !imageUrl) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress, nftName, imageUrl",
      })
    }

    console.log("Minting NFT for:", walletAddress)
    console.log("NFT Name:", nftName)
    console.log("Image URL:", imageUrl)

    // Initialize Solana connection
    const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed")

    // Initialize UMI
    const umi = createUmi(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com")

    // Create keypair from private key
    if (!process.env.SOLANA_PRIVATE_KEY) {
      throw new Error("SOLANA_PRIVATE_KEY environment variable not set")
    }

    const privateKeyBytes = base58.serialize(process.env.SOLANA_PRIVATE_KEY)
    const keypair = umi.eddsa.createKeypairFromSecretKey(privateKeyBytes)
    umi.use(keypairIdentity(keypair))
    umi.use(mplCore())

    // Upload metadata to Pinata
    const metadata = {
      name: nftName,
      description: nftDescription || "",
      image: imageUrl,
      attributes: attributes,
    }

    console.log("Uploading metadata to Pinata...")

    const pinataResponse = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadata, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
    })

    const metadataUri = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`
    console.log("Metadata uploaded to:", metadataUri)

    // Generate asset signer
    const asset = generateSigner(umi)

    // Create mint instruction
    const mintInstruction = await createV1(umi, {
      asset,
      name: nftName,
      uri: metadataUri,
      owner: new PublicKey(walletAddress),
      collection: collectionAddress
        ? {
            key: new PublicKey(collectionAddress),
            verified: false,
          }
        : undefined,
    })

    // Build and send transaction
    const transaction = await mintInstruction.buildAndSign(umi)
    const signature = await umi.rpc.sendAndConfirmTransaction(transaction)

    console.log("NFT minted successfully!")
    console.log("Transaction signature:", base58.deserialize(signature)[0])
    console.log("Asset address:", asset.publicKey)

    return res.status(200).json({
      success: true,
      signature: base58.deserialize(signature)[0],
      assetAddress: asset.publicKey,
      metadataUri: metadataUri,
      message: "NFT minted successfully",
    })
  } catch (error) {
    console.error("Minting error:", error)

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}
