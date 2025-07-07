// FINAL MAINNET BRIDGE - EXPLICIT MAINNET CONFIGURATION
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createNft } from "@metaplex-foundation/mpl-token-metadata"
import { createSignerFromKeypair, signerIdentity, generateSigner, percentAmount } from "@metaplex-foundation/umi"
import { bundlrUploader } from "@metaplex-foundation/umi-uploader-bundlr"
import * as bs58 from "bs58"

// Helper function to parse JSON body from requests
async function parseJSON(req) {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (chunk) => {
      body += chunk.toString()
    })
    req.on("end", () => {
      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
  })
}

// --- EXPLICIT MAINNET CONFIGURATION ---
const MAINNET_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"
console.log("--- BRIDGE SERVER INITIALIZING ON MAINNET ---")
console.log(`🔗 Using RPC Endpoint: ${MAINNET_RPC_URL}`)
console.log("---")

const connection = new Connection(MAINNET_RPC_URL, "confirmed")

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathname = url.pathname

    if (pathname === "/health") {
      return res.status(200).json({
        status: "🔥 Mainnet Bridge is ALIVE",
        network: "mainnet-beta",
        rpc: MAINNET_RPC_URL,
      })
    }

    if (pathname === "/api/prepare-transaction") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
      }
      console.log("💰 /api/prepare-transaction route hit")
      try {
        const body = await parseJSON(req)
        const { fromAddress, toAddress, amountSOL } = body

        if (!fromAddress || !toAddress || !amountSOL) {
          return res.status(400).json({ error: "Missing required parameters" })
        }

        const connection = new Connection(MAINNET_RPC_URL, "confirmed")
        const fromPubkey = new PublicKey(fromAddress)
        const toPubkey = new PublicKey(toAddress)
        const lamports = Math.floor(amountSOL * LAMPORTS_PER_SOL)

        const { blockhash } = await connection.getLatestBlockhash("finalized")

        const transaction = new Transaction({
          feePayer: fromPubkey,
          recentBlockhash: blockhash,
        }).add(
          SystemProgram.transfer({
            fromPubkey: fromPubkey,
            toPubkey: toPubkey,
            lamports: lamports,
          }),
        )

        const serializedTransaction = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        })

        return res.status(200).json({
          success: true,
          transaction: serializedTransaction.toString("base64"),
        })
      } catch (error) {
        console.error("❌ Error in /api/prepare-transaction:", error)
        return res.status(500).json({ success: false, error: error.message })
      }
    }

    if (pathname === "/api/send-transaction") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
      }
      console.log("💸 /api/send-transaction route hit")
      try {
        const body = await parseJSON(req)
        const { signedTransaction } = body

        if (!signedTransaction) {
          return res.status(400).json({ error: "Missing signedTransaction" })
        }

        const connection = new Connection(MAINNET_RPC_URL, "confirmed")
        const rawTransaction = Buffer.from(signedTransaction, "base64")
        const signature = await connection.sendRawTransaction(rawTransaction)
        await connection.confirmTransaction(signature, "finalized")

        return res.status(200).json({
          success: true,
          signature: signature,
        })
      } catch (error) {
        console.error("❌ Error in /api/send-transaction:", error)
        return res.status(500).json({ success: false, error: error.message })
      }
    }

    if (pathname === "/mint-nft") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
      }

      console.log("🎨 === INCOMING MAINNET NFT MINT REQUEST ===")
      const body = await parseJSON(req)
      const { walletAddress, metadata, transactionSignature } = body

      if (!walletAddress || !metadata || !metadata.name || !metadata.image) {
        console.error("❌ Missing required parameters:", { walletAddress, metadata })
        return res.status(400).json({
          success: false,
          error: "Missing required parameters (walletAddress, metadata.name, metadata.image)",
        })
      }

      if (!process.env.CREATOR_PRIVATE_KEY) {
        throw new Error("CREATOR_PRIVATE_KEY not configured on server.")
      }

      // --- 1. SETUP UMI FOR EXPLICIT MAINNET ---
      console.log("🔧 1. Configuring UMI for MAINNET...")
      const umi = createUmi(MAINNET_RPC_URL)

      // Use the MAINNET bundlr network
      umi.use(bundlrUploader({ address: "https://node1.bundlr.network" }))
      console.log("    - Uploader set to MAINNET Bundlr node")

      // Setup our wallet
      const privateKeyArray = JSON.parse(process.env.CREATOR_PRIVATE_KEY)
      const myKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(privateKeyArray))
      const mySigner = createSignerFromKeypair(umi, myKeypair)
      umi.use(signerIdentity(mySigner))
      console.log(`    - Minting wallet configured: ${mySigner.publicKey.toString()}`)

      // --- 2. UPLOAD METADATA TO ARWEAVE (MAINNET) ---
      console.log("📤 2. Uploading metadata to Arweave via MAINNET Bundlr...")
      const imageBlob = await fetch(metadata.image).then((res) => res.blob())
      const imageUri = await umi.uploader.upload([imageBlob])
      console.log(`    - ✅ Image uploaded to Arweave: ${imageUri[0]}`)

      const metadataWithImage = {
        ...metadata,
        image: imageUri[0],
        properties: {
          files: [{ type: imageBlob.type, uri: imageUri[0] }],
        },
      }

      const uri = await umi.uploader.uploadJson(metadataWithImage)
      console.log(`    - ✅ JSON Metadata uploaded to Arweave: ${uri}`)

      // --- 3. MINT THE NFT ON SOLANA MAINNET ---
      console.log("🎨 3. Minting NFT on Solana MAINNET...")
      const mint = generateSigner(umi)
      console.log(`    - Generated Mint Address: ${mint.publicKey}`)

      const result = await createNft(umi, {
        mint,
        name: metadata.name,
        uri: uri,
        sellerFeeBasisPoints: percentAmount(5, 2), // 5%
        creators: [{ address: mySigner.publicKey, verified: true, share: 100 }],
        isMutable: true,
      }).sendAndConfirm(umi, { confirm: { commitment: "finalized" } })

      const mintAddress = mint.publicKey.toString()
      const signature = bs58.encode(result.signature)

      console.log("🎉 === MAINNET MINT SUCCESSFUL ===")
      console.log(`    - ✅ Mint Address: ${mintAddress}`)
      console.log(`    - ✅ Transaction: https://explorer.solana.com/tx/${signature}`)

      return res.status(200).json({
        success: true,
        mint_address: mintAddress,
        message: "🎉 REAL NFT minted successfully on Solana mainnet!",
        explorer_url: `https://explorer.solana.com/address/${mintAddress}`,
        transaction_signature: signature,
        mode: "production",
        network: "mainnet-beta",
      })
    }

    return res.status(404).json({ error: "Endpoint not found" })
  } catch (error) {
    console.error("❌ MINTING PROCESS FAILED:", error)
    console.error("Error Details:", error.cause || error.message)
    return res.status(500).json({
      success: false,
      error: error.message || "An unexpected error occurred during minting.",
      details: error.cause,
    })
  }
}
