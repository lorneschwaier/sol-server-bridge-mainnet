import express from "express"
import { Keypair } from "@solana/web3.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createSignerFromKeypair, signerIdentity, generateSigner } from "@metaplex-foundation/umi"
import { bundlrUploader } from "@metaplex-foundation/umi-uploader-bundlr"
import { createNft } from "@metaplex-foundation/umi-program-token-metadata"
import * as bs58 from "bs58"
import nacl from "tweetnacl"
import cors from "cors"
import * as dotenv from "dotenv" // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config()

// Environment variables
const SECRET_KEY = process.env.SECRET_KEY
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL
const PORT = process.env.PORT || 3000

// Verify .env config
if (!SECRET_KEY || !MAINNET_RPC_URL) {
  console.error("FATAL: Missing .env config")
  process.exit(1)
}

// Generate keypair from secret key
const secretKeyUint8Array = bs58.decode(SECRET_KEY)
const keypair = Keypair.fromSecretKey(secretKeyUint8Array)

// Express app
const app = express()
app.use(cors())
app.use(express.json())

// --- ENDPOINTS ---
app.get("/", (req, res) => {
  res.send("Hello Solana Bridge! 🌉")
})

app.post("/verify-signature", async (req, res) => {
  try {
    const { message, signature, publicKey } = req.body

    if (!message || !signature || !publicKey) {
      return res.status(400).json({
        success: false,
        message: "Missing message, signature, or publicKey",
      })
    }

    const signatureUint8Array = bs58.decode(signature)
    const publicKeyUint8Array = bs58.decode(publicKey)

    const isVerified = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      signatureUint8Array,
      publicKeyUint8Array,
    )

    if (!isVerified) {
      return res.status(401).json({
        success: false,
        message: "Invalid signature",
      })
    }

    res.status(200).json({
      success: true,
      message: "Signature verified!",
    })
  } catch (error) {
    console.error("Signature verification error:", error)
    res.status(500).json({
      success: false,
      message: "Error verifying signature",
      error: error.message,
    })
  }
})

app.post("/mint-nft", async (req, res) => {
  try {
    // Validate we're on mainnet
    if (!MAINNET_RPC_URL.includes("mainnet")) {
      throw new Error("Bridge server must use mainnet RPC for production minting")
    }
    console.log(`🔗 CONFIRMED: Using MAINNET RPC: ${MAINNET_RPC_URL}`)

    const { name, description, image, external_url } = req.body

    if (!name || !description || !image || !external_url) {
      return res.status(400).json({
        success: false,
        message: "Missing name, description, image, or external_url",
      })
    }

    // --- 1. SETUP UMI FOR EXPLICIT MAINNET ---
    console.log("🔧 1. Configuring UMI for MAINNET...")
    const umi = createUmi(MAINNET_RPC_URL)

    // CRITICAL: Use MAINNET Bundlr uploader
    umi.use(
      bundlrUploader({
        address: "https://node1.bundlr.network", // MAINNET Bundlr
      }),
    )
    console.log("    - Uploader set to MAINNET Bundlr node")

    // --- 2. SET UMI WALLET / SIGNER ---
    console.log("🔑 2. Setting UMI wallet...")
    const signer = createSignerFromKeypair(umi, keypair)
    umi.use(signerIdentity(signer))
    console.log("    - Wallet authority set to server's keypair")

    // --- 3. CONFIGURE METADATA ---
    console.log("✍️  3. Configuring NFT Metadata...")
    const metadata = {
      name: name,
      description: description,
      image: image,
      external_url: external_url,
    }

    // --- 4. UPLOAD METADATA TO BUNDLR ---
    console.log("📦 4. Uploading metadata to Bundlr...")
    const uri = await umi.uploader.uploadJson(metadata)
    console.log(`    - Metadata URI: ${uri}`)

    // --- 5. MINT NFT ---
    console.log("🚀 5. Minting the NFT...")
    const mint = generateSigner(umi)

    await createNft(umi, {
      mint,
      name: metadata.name,
      uri: uri,
      sellerFeeBasisPoints: 0,
    })
      .then(async (result) => {
        console.log(`🎉 NFT Minted! Mint Address: ${mint.publicKey}`)
        console.log("Transaction Signature:", result.signature)

        const mintAddress = mint.publicKey.toString()
        const signature = result.signature.toString()

        return res.status(200).json({
          success: true,
          mint_address: mintAddress,
          message: "🎉 REAL NFT minted successfully on Solana MAINNET!",
          explorer_url: `https://explorer.solana.com/address/${mintAddress}`, // No devnet cluster param
          transaction_signature: signature,
          mode: "production",
          network: "mainnet-beta",
          rpc_used: MAINNET_RPC_URL, // Add this for verification
        })
      })
      .catch((error) => {
        console.error("Error minting NFT:", error)
        return res.status(500).json({
          success: false,
          message: "Error minting NFT",
          error: error.message,
        })
      })
  } catch (error) {
    console.error("Minting error:", error)
    return res.status(500).json({
      success: false,
      message: "Minting error",
      error: error.message,
    })
  }
})

// Start the server
app.listen(PORT, () => {
  console.log(`Solana Bridge listening on port ${PORT}`)
})
