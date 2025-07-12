import { PublicKey } from "@solana/web3.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { create, mplCore } from "@metaplex-foundation/mpl-core"
import { generateSigner, keypairIdentity } from "@metaplex-foundation/umi"
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
    const { name, description, image, attributes, walletAddress, collectionAddress } = req.body

    if (!name || !description || !image || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, description, image, walletAddress",
      })
    }

    console.log("Starting NFT minting process for:", name)

    // Initialize Umi
    const umi = createUmi(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com")

    // Set up the authority keypair
    const authorityKeypair = umi.eddsa.createKeypairFromSecretKey(
      new Uint8Array(JSON.parse(process.env.SOLANA_PRIVATE_KEY)),
    )
    umi.use(keypairIdentity(authorityKeypair))
    umi.use(mplCore())

    // Upload metadata to Pinata
    const metadata = {
      name,
      description,
      image,
      attributes: attributes || [],
    }

    console.log("Uploading metadata to Pinata...")

    const formData = new FormData()
    formData.append("pinataContent", JSON.stringify(metadata))
    formData.append(
      "pinataMetadata",
      JSON.stringify({
        name: `${name}-metadata.json`,
      }),
    )

    const pinataResponse = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", formData, {
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
        ...formData.getHeaders(),
      },
    })

    const metadataUri = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`
    console.log("Metadata uploaded to:", metadataUri)

    // Generate NFT signer
    const nftSigner = generateSigner(umi)

    // Create the NFT
    console.log("Creating NFT with Metaplex Core...")

    const createInstruction = create(umi, {
      asset: nftSigner,
      owner: new PublicKey(walletAddress),
      name,
      uri: metadataUri,
      collection: collectionAddress ? new PublicKey(collectionAddress) : undefined,
    })

    // Build and send transaction
    const transaction = await createInstruction.buildAndSign(umi)
    const signature = await umi.rpc.sendAndConfirmTransaction(transaction)

    console.log("NFT minted successfully with signature:", signature)

    return res.status(200).json({
      success: true,
      signature: signature,
      nftAddress: nftSigner.publicKey.toString(),
      metadataUri,
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
