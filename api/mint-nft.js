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
    const { walletAddress, metadata } = req.body

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      })
    }

    // Check environment variables
    if (!process.env.CREATOR_PRIVATE_KEY) {
      return res.status(500).json({
        success: false,
        error: "CREATOR_PRIVATE_KEY not configured",
      })
    }

    if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: "Pinata API credentials not configured",
      })
    }

    // Dynamic imports
    const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = await import("@solana/web3.js")
    const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults")
    const { createV1, mplCore } = await import("@metaplex-foundation/mpl-core")
    const { keypairIdentity, generateSigner, publicKey, some, none } = await import("@metaplex-foundation/umi")
    const { fromWeb3JsKeypair } = await import("@metaplex-foundation/umi-web3js-adapters")
    const axios = await import("axios")
    const bs58 = await import("bs58")

    // Environment variables
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))

    console.log("🎨 === NFT MINTING REQUEST ===")
    console.log("👤 Wallet:", walletAddress)
    console.log("📋 Metadata:", JSON.stringify(metadata, null, 2))

    // Validate wallet address
    try {
      new PublicKey(walletAddress)
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address format",
      })
    }

    // Step 1: Upload metadata to Pinata
    console.log("📤 Step 1: Uploading metadata...")

    const pinataResponse = await axios.default.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: metadata,
        pinataMetadata: {
          name: `nft-metadata-${Date.now()}.json`,
        },
      },
      {
        headers: {
          pinata_api_key: process.env.PINATA_API_KEY,
          pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
        },
        timeout: 30000,
      },
    )

    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`
    console.log("✅ Metadata uploaded to Pinata:", metadataUrl)

    // Step 2: Initialize Solana connection and mint NFT
    console.log("⚡ Step 2: Minting NFT...")

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    // Parse private key
    let privateKeyArray
    if (process.env.CREATOR_PRIVATE_KEY.startsWith("[")) {
      privateKeyArray = JSON.parse(process.env.CREATOR_PRIVATE_KEY)
    } else {
      privateKeyArray = Array.from(bs58.default.decode(process.env.CREATOR_PRIVATE_KEY))
    }

    // Create Web3.js keypair
    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString())

    // Check creator wallet balance
    const balance = await connection.getBalance(creatorKeypair.publicKey)
    console.log("💰 Creator wallet balance:", balance / LAMPORTS_PER_SOL, "SOL")

    if (balance < 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(
        `Insufficient SOL in creator wallet. Balance: ${balance / LAMPORTS_PER_SOL} SOL. Please fund the wallet.`,
      )
    }

    // Initialize UMI with Metaplex Core
    const umi = createUmi(SOLANA_RPC_URL).use(mplCore())
    const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
    const creatorUmi = umi.use(keypairIdentity(umiKeypair))

    // Generate asset signer
    const asset = generateSigner(creatorUmi)
    console.log("🔑 Generated asset address:", asset.publicKey)

    // Prepare collection (if provided)
    let collectionConfig = none()
    if (metadata.collection && metadata.collection.trim()) {
      try {
        const collectionPubkey = publicKey(metadata.collection.trim())
        collectionConfig = some({ key: collectionPubkey, verified: false })
        console.log("📁 Collection configured:", metadata.collection)
      } catch (error) {
        console.log("⚠️ Invalid collection address, proceeding without collection")
      }
    }

    console.log("⚡ Creating NFT with Metaplex Core...")

    // Create the NFT using Metaplex Core
    const createInstruction = createV1(creatorUmi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      uri: metadataUrl,
      collection: collectionConfig,
    })

    // Execute the transaction
    console.log("📡 Submitting transaction to Solana...")
    const result = await createInstruction.sendAndConfirm(creatorUmi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: false },
    })

    console.log("🎉 === NFT MINTED SUCCESSFULLY! ===")
    console.log("🔗 Asset address:", asset.publicKey)
    console.log("📝 Transaction signature:", result.signature)

    const explorerUrl = `https://explorer.solana.com/address/${asset.publicKey}${SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""}`

    res.status(200).json({
      success: true,
      mintAddress: asset.publicKey,
      transactionSignature: result.signature,
      metadataUrl: metadataUrl,
      explorerUrl: explorerUrl,
      network: SOLANA_NETWORK,
      method: "metaplex_core",
      message: "NFT minted successfully on Solana with Metaplex Core!",
    })
  } catch (error) {
    console.error("❌ Mint NFT error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}
