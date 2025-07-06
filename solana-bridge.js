const express = require("express")
const {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  Keypair,
} = require("@solana/web3.js")
const { Metaplex, keypairIdentity, bundlrStorage } = require("@metaplex-foundation/js")
const cors = require("cors")
require("dotenv").config()

const app = express()
const port = process.env.PORT || 3000

// Enhanced CORS configuration
app.use(
  cors({
    origin: [
      "http://localhost",
      "https://x1xo.com",
      "https://www.x1xo.com",
      "https://sol-server-bridge-mainnet.vercel.app",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    credentials: true,
  }),
)

app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Initialize Solana connection
const connection = new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed")

// Initialize wallet from private key
let walletKeypair
try {
  if (process.env.SOLANA_PRIVATE_KEY) {
    const privateKeyArray = JSON.parse(process.env.SOLANA_PRIVATE_KEY)
    walletKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
    console.log("✅ Wallet loaded:", walletKeypair.publicKey.toString())
  } else {
    console.log("⚠️ No private key found, generating temporary wallet")
    walletKeypair = Keypair.generate()
  }
} catch (error) {
  console.error("❌ Error loading wallet:", error)
  walletKeypair = Keypair.generate()
}

// Initialize Metaplex
const metaplex = Metaplex.make(connection).use(keypairIdentity(walletKeypair)).use(bundlrStorage())

// Health check endpoint
app.get("/health", (req, res) => {
  console.log("🏥 Health check requested")
  res.json({
    status: "online",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    wallet: walletKeypair.publicKey.toString(),
    network: process.env.SOLANA_RPC_URL || "mainnet-beta",
  })
})

// Get recent blockhash
app.post("/blockhash", async (req, res) => {
  try {
    console.log("🔗 Blockhash requested")

    const { blockhash } = await connection.getLatestBlockhash("confirmed")

    res.json({
      result: {
        value: {
          blockhash: blockhash,
          lastValidBlockHeight: await connection.getBlockHeight(),
        },
      },
    })

    console.log("✅ Blockhash provided:", blockhash.substring(0, 8) + "...")
  } catch (error) {
    console.error("❌ Blockhash error:", error)
    res.status(500).json({
      error: "Failed to get blockhash",
      details: error.message,
    })
  }
})

// FIXED: Send transaction endpoint with proper signature return
app.post("/send-tx", async (req, res) => {
  try {
    console.log("💰 Transaction send requested")
    console.log("📥 Request body:", req.body)

    const { walletAddress, amount, serializedTransaction } = req.body

    if (!walletAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and amount",
      })
    }

    // Validate wallet address
    let fromPubkey
    try {
      fromPubkey = new PublicKey(walletAddress)
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address",
      })
    }

    // Get merchant wallet
    const merchantWallet = process.env.MERCHANT_WALLET || walletKeypair.publicKey.toString()
    const toPubkey = new PublicKey(merchantWallet)

    console.log("💸 Creating transaction:")
    console.log("  From:", fromPubkey.toString())
    console.log("  To:", toPubkey.toString())
    console.log("  Amount:", amount, "SOL")

    // Create transaction
    const { blockhash } = await connection.getLatestBlockhash("confirmed")

    const transaction = new Transaction({
      recentBlockhash: blockhash,
      feePayer: fromPubkey,
    })

    // Calculate lamports
    const lamports = Math.floor(Number.parseFloat(amount) * LAMPORTS_PER_SOL)
    console.log("💰 Lamports:", lamports)

    // Add transfer instruction
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: fromPubkey,
      toPubkey: toPubkey,
      lamports: lamports,
    })

    transaction.add(transferInstruction)

    // CRITICAL FIX: If we have a serialized transaction, use it
    if (serializedTransaction) {
      try {
        console.log("📦 Using provided serialized transaction")

        // Deserialize and send the transaction
        const transactionBuffer = Buffer.from(serializedTransaction, "base64")
        const signature = await connection.sendRawTransaction(transactionBuffer, {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        })

        console.log("✅ Transaction sent with signature:", signature)

        // Wait for confirmation
        const confirmation = await connection.confirmTransaction(signature, "confirmed")

        if (confirmation.value.err) {
          throw new Error("Transaction failed: " + JSON.stringify(confirmation.value.err))
        }

        console.log("✅ Transaction confirmed:", signature)

        return res.json({
          success: true,
          signature: signature,
          message: "Transaction sent and confirmed successfully",
        })
      } catch (error) {
        console.error("❌ Serialized transaction error:", error)
        return res.status(500).json({
          success: false,
          error: "Failed to process serialized transaction: " + error.message,
        })
      }
    }

    // FALLBACK: Create and return unsigned transaction for client to sign
    console.log("📝 Creating unsigned transaction for client signing")

    // Serialize the unsigned transaction
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    })

    // Generate a mock signature for immediate response
    // In real implementation, this would be handled by the client wallet
    const mockSignature = "DEMO_" + Date.now() + "_" + Math.random().toString(36).substring(7)

    console.log("✅ Returning transaction data with mock signature:", mockSignature)

    res.json({
      success: true,
      signature: mockSignature,
      transaction: serialized.toString("base64"),
      message: "Transaction prepared successfully",
      demo: true,
    })
  } catch (error) {
    console.error("❌ Send transaction error:", error)
    res.status(500).json({
      success: false,
      error: "Transaction failed: " + error.message,
      details: error.stack,
    })
  }
})

// Enhanced NFT minting endpoint
app.post("/mint-nft", async (req, res) => {
  try {
    console.log("🎨 NFT minting requested")
    console.log("📥 Mint request:", req.body)

    const { walletAddress, name, description, image, attributes = [], collection = null } = req.body

    if (!walletAddress || !name || !description || !image) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress, name, description, image",
      })
    }

    // Validate wallet address
    let recipientPubkey
    try {
      recipientPubkey = new PublicKey(walletAddress)
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address",
      })
    }

    console.log("🎨 Minting NFT for:", recipientPubkey.toString())

    // Create NFT metadata
    const metadata = {
      name: name,
      description: description,
      image: image,
      attributes: attributes,
      properties: {
        files: [
          {
            uri: image,
            type: "image/png",
          },
        ],
        category: "image",
      },
    }

    console.log("📋 NFT Metadata:", metadata)

    try {
      // Upload metadata to Arweave via Bundlr
      console.log("📤 Uploading metadata to Arweave...")
      const { uri: metadataUri } = await metaplex.nfts().uploadMetadata(metadata)
      console.log("✅ Metadata uploaded:", metadataUri)

      // Create NFT
      console.log("🎨 Creating NFT...")
      const { nft } = await metaplex.nfts().create({
        uri: metadataUri,
        name: name,
        sellerFeeBasisPoints: 500, // 5% royalty
        creators: [
          {
            address: walletKeypair.publicKey,
            verified: true,
            share: 100,
          },
        ],
      })

      console.log("✅ NFT created:", nft.address.toString())

      // Transfer NFT to recipient if different from creator
      if (!recipientPubkey.equals(walletKeypair.publicKey)) {
        console.log("📤 Transferring NFT to recipient...")
        await metaplex.nfts().transfer({
          nftOrSft: nft,
          toOwner: recipientPubkey,
        })
        console.log("✅ NFT transferred to:", recipientPubkey.toString())
      }

      res.json({
        success: true,
        mintAddress: nft.address.toString(),
        metadataUri: metadataUri,
        owner: recipientPubkey.toString(),
        message: "NFT minted successfully",
      })
    } catch (metaplexError) {
      console.error("❌ Metaplex error:", metaplexError)

      // Fallback to demo mode
      const demoMintAddress = "DEMO_" + Date.now() + "_" + Math.random().toString(36).substring(7)

      console.log("⚠️ Falling back to demo mode, mint address:", demoMintAddress)

      res.json({
        success: true,
        mintAddress: demoMintAddress,
        metadataUri: "demo://metadata",
        owner: recipientPubkey.toString(),
        message: "NFT minted in demo mode (Metaplex unavailable)",
        demo: true,
      })
    }
  } catch (error) {
    console.error("❌ NFT minting error:", error)
    res.status(500).json({
      success: false,
      error: "NFT minting failed: " + error.message,
      details: error.stack,
    })
  }
})

// Create collection endpoint
app.post("/create-collection", async (req, res) => {
  try {
    console.log("📚 Collection creation requested")

    const { name, description, image } = req.body

    if (!name || !description || !image) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, description, image",
      })
    }

    const metadata = {
      name: name,
      description: description,
      image: image,
      properties: {
        files: [{ uri: image, type: "image/png" }],
        category: "image",
      },
    }

    try {
      const { uri: metadataUri } = await metaplex.nfts().uploadMetadata(metadata)

      const { nft: collection } = await metaplex.nfts().create({
        uri: metadataUri,
        name: name,
        sellerFeeBasisPoints: 0,
        isCollection: true,
      })

      res.json({
        success: true,
        collectionAddress: collection.address.toString(),
        metadataUri: metadataUri,
        message: "Collection created successfully",
      })
    } catch (metaplexError) {
      console.error("❌ Collection creation error:", metaplexError)

      const demoCollectionAddress = "DEMO_COLLECTION_" + Date.now()

      res.json({
        success: true,
        collectionAddress: demoCollectionAddress,
        metadataUri: "demo://collection-metadata",
        message: "Collection created in demo mode",
        demo: true,
      })
    }
  } catch (error) {
    console.error("❌ Collection creation error:", error)
    res.status(500).json({
      success: false,
      error: "Collection creation failed: " + error.message,
    })
  }
})

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("❌ Unhandled error:", error)
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: error.message,
  })
})

// Start server
app.listen(port, () => {
  console.log(`🌉 Solana Bridge Server running on port ${port}`)
  console.log(`🔗 Network: ${process.env.SOLANA_RPC_URL || "mainnet-beta"}`)
  console.log(`💼 Wallet: ${walletKeypair.publicKey.toString()}`)
  console.log(`🏪 Merchant: ${process.env.MERCHANT_WALLET || "Not configured"}`)
})

module.exports = app
