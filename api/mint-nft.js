import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { mplCore, createV1 } from "@metaplex-foundation/mpl-core"
import { createSignerFromKeypair, signerIdentity, generateSigner } from "@metaplex-foundation/umi"
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters"
import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"
import axios from "axios"

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const { name, description, image, recipient } = req.body

    if (!name || !description || !image || !recipient) {
      return res.status(400).json({
        error: "Missing required fields: name, description, image, recipient",
      })
    }

    // Initialize Umi
    const umi = createUmi(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com").use(mplCore())

    // Create creator keypair from private key
    const creatorKeypair = Keypair.fromSecretKey(bs58.decode(process.env.CREATOR_PRIVATE_KEY))
    const creatorSigner = createSignerFromKeypair(umi, fromWeb3JsKeypair(creatorKeypair))
    umi.use(signerIdentity(creatorSigner))

    // Upload metadata to Pinata
    const metadata = {
      name,
      description,
      image,
      attributes: [],
      properties: {
        files: [{ uri: image, type: "image/png" }],
        category: "image",
      },
    }

    const pinataResponse = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadata, {
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: process.env.PINATA_API_KEY,
        pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
      },
    })

    const metadataUri = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`

    // Generate asset keypair
    const asset = generateSigner(umi)

    // Create the NFT
    const tx = await createV1(umi, {
      asset,
      name,
      uri: metadataUri,
      owner: recipient,
      authority: creatorSigner,
      collection: null,
      plugins: [],
    }).sendAndConfirm(umi)

    res.status(200).json({
      success: true,
      message: "NFT minted successfully",
      data: {
        signature: bs58.encode(tx.signature),
        asset: asset.publicKey,
        metadataUri,
        recipient,
      },
    })
  } catch (error) {
    console.error("Minting error:", error)
    res.status(500).json({
      success: false,
      error: "Failed to mint NFT",
      details: error.message,
    })
  }
}
