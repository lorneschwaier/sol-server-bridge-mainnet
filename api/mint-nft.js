import { Connection, PublicKey } from "@solana/web3.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata"
import { generateSigner, keypairIdentity, percentAmount } from "@metaplex-foundation/umi"
import axios from "axios"
import FormData from "form-data"

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
    const { name, description, image, attributes, collection, walletAddress, payerPrivateKey } = req.body

    // Validate required fields
    if (!name || !description || !image || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, description, image, walletAddress",
      })
    }

    console.log("Starting NFT minting process for:", name)

    // Initialize Solana connection
    const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com", "confirmed")

    // Initialize UMI
    const umi = createUmi(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com").use(mplTokenMetadata())

    // Set up payer keypair
    if (!payerPrivateKey) {
      return res.status(400).json({
        success: false,
        error: "Payer private key is required",
      })
    }

    const payerKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(JSON.parse(payerPrivateKey)))
    umi.use(keypairIdentity(payerKeypair))

    // Upload image to Pinata if it's base64
    let imageUrl = image
    if (image.startsWith("data:image/")) {
      console.log("Uploading image to Pinata...")

      const base64Data = image.split(",")[1]
      const buffer = Buffer.from(base64Data, "base64")

      const formData = new FormData()
      formData.append("file", buffer, { filename: `${name}.png` })

      const pinataResponse = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
        },
      })

      imageUrl = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`
      console.log("Image uploaded to IPFS:", imageUrl)
    }

    // Create metadata object
    const metadata = {
      name,
      description,
      image: imageUrl,
      attributes: attributes || [],
      properties: {
        files: [
          {
            uri: imageUrl,
            type: "image/png",
          },
        ],
        category: "image",
      },
    }

    // Upload metadata to Pinata
    console.log("Uploading metadata to Pinata...")
    const metadataResponse = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadata, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
    })

    const metadataUri = `https://gateway.pinata.cloud/ipfs/${metadataResponse.data.IpfsHash}`
    console.log("Metadata uploaded to IPFS:", metadataUri)

    // Generate mint keypair
    const mint = generateSigner(umi)

    // Create NFT transaction
    console.log("Creating NFT transaction...")
    const createNftTx = createNft(umi, {
      mint,
      name,
      uri: metadataUri,
      sellerFeeBasisPoints: percentAmount(5.5),
      collection: collection ? { key: new PublicKey(collection), verified: false } : undefined,
      creators: [
        {
          address: umi.identity.publicKey,
          verified: true,
          share: 100,
        },
      ],
    })

    // Send and confirm transaction
    console.log("Sending NFT creation transaction...")
    const result = await createNftTx.sendAndConfirm(umi)

    console.log("NFT minted successfully!")
    console.log("Transaction signature:", result.signature)
    console.log("Mint address:", mint.publicKey)

    return res.status(200).json({
      success: true,
      signature: result.signature,
      mintAddress: mint.publicKey,
      metadataUri,
      imageUrl,
      message: "NFT minted successfully",
    })
  } catch (error) {
    console.error("NFT minting error:", error)

    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}
