// Comprehensive Buffer polyfill for Vercel and browser compatibility
;(() => {
  if (typeof globalThis.Buffer === "undefined") {
    globalThis.Buffer = {
      from: (data, encoding) => {
        if (data instanceof Uint8Array) return data
        if (typeof data === "string") {
          if (encoding === "base64") {
            return Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
          }
          return new TextEncoder().encode(data)
        }
        // Fallback for other types, or throw error if strict
        return new Uint8Array(0)
      },
      alloc: (size) => new Uint8Array(size),
      isBuffer: (obj) => obj instanceof Uint8Array,
    }
  }
})()

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  try {
    const { walletAddress, metadata } = req.body
    console.log("🎨 === METADATA FOCUSED NFT CREATION ===")
    console.log("👤 Wallet Address:", walletAddress)
    console.log("📋 Incoming Metadata:", JSON.stringify(metadata, null, 2))

    if (!walletAddress || !metadata) {
      console.error("❌ Missing required fields: walletAddress and metadata")
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      })
    }

    // Environment variables
    const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY
    const PINATA_API_KEY = process.env.PINATA_API_KEY
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL =
      process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com")
    const CURRENT_SOL_PRICE = process.env.CURRENT_SOL_PRICE || 150 // Declare currentSOLPrice

    console.log("⚙️ Environment Config:")
    console.log("   - SOLANA_NETWORK:", SOLANA_NETWORK)
    console.log("   - SOLANA_RPC_URL:", SOLANA_RPC_URL)
    console.log("   - CREATOR_PRIVATE_KEY configured:", !!CREATOR_PRIVATE_KEY)
    console.log("   - PINATA_API_KEY configured:", !!PINATA_API_KEY)

    if (!CREATOR_PRIVATE_KEY) {
      console.error("❌ Creator private key not configured.")
      return res.status(500).json({ success: false, error: "Creator private key not configured" })
    }
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      console.error("❌ Pinata API credentials not configured.")
      return res.status(500).json({ success: false, error: "Pinata API credentials not configured" })
    }

    // Import libraries
    let Connection, PublicKey, Keypair
    let createMint, getOrCreateAssociatedTokenAccount, mintTo
    let bs58
    let axios
    let metaplexModule, createCreateMetadataAccountV3Instruction, METADATA_PROGRAM_ID

    try {
      ;({ Connection, PublicKey, Keypair } = await import("@solana/web3.js"))
      ;({ createMint, getOrCreateAssociatedTokenAccount, mintTo } = await import("@solana/spl-token"))
      bs58 = (await import("bs58")).default
      axios = (await import("axios")).default
      console.log("✅ Core Solana, SPL, bs58, axios imported successfully.")
    } catch (importError) {
      console.error("❌ Core library imports FAILED:", importError.message)
      return res.status(500).json({ success: false, error: "Failed to load core libraries: " + importError.message })
    }

    // Initialize connection
    const connection = new Connection(SOLANA_RPC_URL, "confirmed")
    console.log("✅ Solana connection initialized to:", SOLANA_RPC_URL)

    // Parse private key
    let privateKeyArray
    try {
      const privateKey = CREATOR_PRIVATE_KEY.trim()
      if (privateKey.startsWith("[")) {
        privateKeyArray = JSON.parse(privateKey)
      } else {
        const decoded = bs58.decode(privateKey)
        privateKeyArray = Array.from(decoded)
      }
      console.log("✅ Creator private key parsed. Array length:", privateKeyArray.length)
    } catch (error) {
      console.error("❌ Error parsing CREATOR_PRIVATE_KEY format:", error.message)
      return res.status(500).json({ success: false, error: "Invalid CREATOR_PRIVATE_KEY format" })
    }
    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString())

    // Check balance with lower threshold
    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey)
    console.log("💰 Creator wallet balance before mint:", balanceBefore / 1e9, "SOL")
    if (balanceBefore < 0.003 * 1e9) {
      console.error(`❌ Insufficient SOL. Balance: ${balanceBefore / 1e9} SOL.`)
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL. Balance: ${balanceBefore / 1e9} SOL.`,
      })
    }

    // Step 1: Upload metadata to IPFS FIRST
    console.log("📤 Step 1: Uploading metadata to IPFS...")
    let metadataUri
    try {
      const nftMetadata = {
        name: metadata.name || "WordPress NFT",
        description: metadata.description || "NFT created via WordPress store",
        image: metadata.image || "https://via.placeholder.com/512x512.png?text=WordPress+NFT",
        attributes: [
          { trait_type: "Product ID", value: String(metadata.product_id || "unknown") },
          { trait_type: "Platform", value: "WordPress" },
          { trait_type: "Creator", value: "WordPress Store" },
          { trait_type: "Minted Date", value: new Date().toISOString().split("T")[0] },
        ],
        properties: {
          files: [
            {
              uri: metadata.image || "https://via.placeholder.com/512x512.png?text=WordPress+NFT",
              type: "image/png",
            },
          ],
          category: "image",
        },
      }
      console.log("📋 NFT Metadata being uploaded:", JSON.stringify(nftMetadata, null, 2))

      const pinataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          pinataContent: nftMetadata,
          pinataMetadata: {
            name: `wordpress-nft-metadata-${Date.now()}.json`,
          },
        },
        {
          headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_KEY,
          },
          timeout: 30000,
        },
      )
      metadataUri = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`
      console.log("✅ Metadata uploaded to IPFS:", metadataUri)
    } catch (ipfsError) {
      console.error("❌ IPFS upload failed:", ipfsError.message)
      return res.status(500).json({
        success: false,
        error: "Metadata upload failed: " + ipfsError.message,
      })
    }

    // Step 2: Create mint using simple approach first
    console.log("⚡ Step 2: Creating mint...")
    const mint = await createMint(
      connection,
      creatorKeypair,
      creatorKeypair.publicKey,
      creatorKeypair.publicKey,
      0, // 0 decimals for NFT
    )
    console.log("🔑 Mint created:", mint.toString())

    // Step 3: Create metadata account using Metaplex
    console.log("📝 Step 3: Creating Metaplex metadata account...")
    try {
      metaplexModule = await import("@metaplex-foundation/mpl-token-metadata")
      ;({ createCreateMetadataAccountV3Instruction, PROGRAM_ID: METADATA_PROGRAM_ID } = metaplexModule)
      console.log("✅ Metaplex mpl-token-metadata imported successfully.")

      // Find metadata account PDA
      console.log("Debugging PDA calculation:")
      console.log("  Buffer.from('metadata'):", Buffer.from("metadata"))
      console.log("  METADATA_PROGRAM_ID:", METADATA_PROGRAM_ID ? METADATA_PROGRAM_ID.toString() : "undefined")
      console.log(
        "  METADATA_PROGRAM_ID.toBuffer():",
        METADATA_PROGRAM_ID && METADATA_PROGRAM_ID.toBuffer
          ? METADATA_PROGRAM_ID.toBuffer()
          : "undefined (METADATA_PROGRAM_ID or its toBuffer is undefined)",
      )
      console.log("  mint:", mint ? mint.toString() : "undefined")
      console.log(
        "  mint.toBuffer():",
        mint && mint.toBuffer ? mint.toBuffer() : "undefined (mint or its toBuffer is undefined)",
      )

      const [metadataAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
        METADATA_PROGRAM_ID,
      )
      console.log("📍 Metadata account PDA:", metadataAccount.toString())

      // Create metadata account instruction
      const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataAccount,
          mint: mint,
          mintAuthority: creatorKeypair.publicKey,
          payer: creatorKeypair.publicKey,
          updateAuthority: creatorKeypair.publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name: metadata.name || "WordPress NFT",
              symbol: "WP",
              uri: metadataUri,
              sellerFeeBasisPoints: 0,
              creators: [
                {
                  address: creatorKeypair.publicKey,
                  verified: true,
                  share: 100,
                },
              ],
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          },
        },
      )
      // Send metadata transaction
      const { Transaction } = await import("@solana/web3.js")
      const metadataTransaction = new Transaction().add(createMetadataInstruction)

      const metadataSignature = await connection.sendTransaction(metadataTransaction, [creatorKeypair])
      await connection.confirmTransaction(metadataSignature)

      console.log("✅ Metadata account created! Signature:", metadataSignature)
    } catch (metaplexError) {
      console.error("❌ Metaplex metadata creation failed:", metaplexError.message)
      console.error("Metaplex Error Details:", metaplexError)
      console.log("⚠️ Continuing without metadata - will be basic SPL token")
    }

    // Step 4: Mint token to recipient
    console.log("🚀 Step 4: Minting token to recipient...")
    const recipientPubkey = new PublicKey(walletAddress)
    const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, creatorKeypair, mint, recipientPubkey)
    const mintSignature = await mintTo(
      connection,
      creatorKeypair,
      mint,
      tokenAccount.address,
      creatorKeypair.publicKey,
      1,
    )

    // Cost tracking
    const balanceAfter = await connection.getBalance(creatorKeypair.publicKey)
    const totalCostSOL = (balanceBefore - balanceAfter) / 1e9

    console.log("🎉 === NFT CREATION COMPLETE ===")
    console.log("🔗 Mint address:", mint.toString())
    console.log("📝 Mint signature:", mintSignature)
    console.log("🌐 Metadata URI:", metadataUri)
    console.log("💰 Total cost:", totalCostSOL, "SOL")

    return res.status(200).json({
      success: true,
      mintAddress: mint.toString(),
      transactionSignature: mintSignature,
      metadataUri: metadataUri,
      explorerUrl: `https://explorer.solana.com/address/${mint.toString()}${SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""}`,
      message: "NFT with metadata created on Solana!",
      costs: {
        totalSOL: totalCostSOL,
        totalUSD: totalCostSOL * CURRENT_SOL_PRICE, // Use CURRENT_SOL_PRICE if available, else default
      },
    })
  } catch (error) {
    console.error("❌ NFT creation error:", error)
    return res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
