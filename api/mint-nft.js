const { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require("@solana/web3.js")
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults")
const { createSignerFromKeypair, signerIdentity, generateSigner, percentAmount } = require("@metaplex-foundation/umi")
const { createNft, mplTokenMetadata } = require("@metaplex-foundation/mpl-token-metadata")
const { base58 } = require("@metaplex-foundation/umi/serializers")
const bs58 = require("bs58")

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
}

module.exports = async (req, res) => {
  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).json({ message: "OK" })
  }

  // Set CORS headers
  Object.keys(corsHeaders).forEach((key) => {
    res.setHeader(key, corsHeaders[key])
  })

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    })
  }

  try {
    const { buyerWallet, productId, nftName, nftDescription, nftImage, paymentSignature, sellerWallet } = req.body

    console.log("🎨 Starting NFT minting process...")
    console.log("Buyer:", buyerWallet)
    console.log("Product ID:", productId)
    console.log("Payment Signature:", paymentSignature)

    // Validate required fields
    if (!buyerWallet || !productId || !nftName || !nftImage || !paymentSignature) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        required: ["buyerWallet", "productId", "nftName", "nftImage", "paymentSignature"],
      })
    }

    // Verify environment variables
    const creatorPrivateKey = process.env.CREATOR_PRIVATE_KEY
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

    if (!creatorPrivateKey) {
      return res.status(500).json({
        success: false,
        error: "Server configuration error: Missing CREATOR_PRIVATE_KEY",
      })
    }

    console.log("🔗 Connecting to Solana...")

    // Create UMI instance
    const umi = createUmi(rpcUrl)

    // Create creator keypair from private key
    let creatorKeypair
    try {
      const privateKeyBytes = bs58.decode(creatorPrivateKey)
      creatorKeypair = umi.eddsa.createKeypairFromSecretKey(privateKeyBytes)
    } catch (error) {
      console.error("❌ Invalid private key format:", error)
      return res.status(500).json({
        success: false,
        error: "Invalid creator private key format",
      })
    }

    const creatorSigner = createSignerFromKeypair(umi, creatorKeypair)
    umi.use(signerIdentity(creatorSigner))
    umi.use(mplTokenMetadata())

    console.log("👤 Creator wallet:", creatorSigner.publicKey)

    // Verify payment signature
    const connection = new Connection(rpcUrl, "confirmed")

    try {
      const signatureStatus = await connection.getSignatureStatus(paymentSignature)

      if (!signatureStatus.value || signatureStatus.value.err) {
        return res.status(400).json({
          success: false,
          error: "Invalid or failed payment transaction",
          signature: paymentSignature,
        })
      }

      console.log("✅ Payment verified:", paymentSignature)
    } catch (error) {
      console.error("❌ Payment verification failed:", error)
      return res.status(400).json({
        success: false,
        error: "Could not verify payment transaction",
        details: error.message,
      })
    }

    // Generate mint address
    const mint = generateSigner(umi)
    console.log("🏷️ Generated mint address:", mint.publicKey)

    // Create NFT metadata
    const metadata = {
      name: nftName,
      description: nftDescription || `NFT for product ${productId}`,
      image: nftImage,
      attributes: [
        {
          trait_type: "Product ID",
          value: productId.toString(),
        },
        {
          trait_type: "Minted For",
          value: buyerWallet,
        },
        {
          trait_type: "Mint Date",
          value: new Date().toISOString(),
        },
      ],
      properties: {
        category: "image",
        files: [
          {
            uri: nftImage,
            type: "image/png",
          },
        ],
      },
    }

    console.log("📝 Creating NFT with metadata:", metadata)

    // Create the NFT
    const createNftInstruction = createNft(umi, {
      mint,
      name: metadata.name,
      symbol: "XENO",
      uri: `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`,
      sellerFeeBasisPoints: percentAmount(5), // 5% royalty
      creators: [
        {
          address: creatorSigner.publicKey,
          verified: true,
          share: 100,
        },
      ],
      collection: null,
    })

    console.log("🚀 Sending NFT creation transaction...")

    // Send and confirm transaction
    const result = await createNftInstruction.sendAndConfirm(umi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: true },
    })

    const signature = base58.deserialize(result.signature)[0]
    console.log("✅ NFT minted successfully!")
    console.log("🔗 Transaction:", signature)
    console.log("🏷️ Mint address:", mint.publicKey)

    // Return success response
    return res.status(200).json({
      success: true,
      message: "NFT minted successfully!",
      data: {
        mintAddress: mint.publicKey,
        transactionSignature: signature,
        buyerWallet: buyerWallet,
        productId: productId,
        metadata: metadata,
        explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`,
      },
    })
  } catch (error) {
    console.error("❌ NFT minting failed:", error)

    return res.status(500).json({
      success: false,
      error: "NFT minting failed",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}
