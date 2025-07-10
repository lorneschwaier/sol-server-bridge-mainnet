export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

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

    const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = await import("@solana/web3.js")
    const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults")
    const { createV1, mplCore } = await import("@metaplex-foundation/mpl-core")
    const { keypairIdentity, generateSigner, publicKey, some, none } = await import("@metaplex-foundation/umi")
    const { fromWeb3JsKeypair } = await import("@metaplex-foundation/umi-web3js-adapters")
    const axios = await import("axios")
    const bs58 = await import("bs58")

    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

    try {
      new PublicKey(walletAddress)
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address format",
      })
    }

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

    const connection = new Connection(SOLANA_RPC_URL, "confirmed")

    let privateKeyArray
    if (process.env.CREATOR_PRIVATE_KEY.startsWith("[")) {
      privateKeyArray = JSON.parse(process.env.CREATOR_PRIVATE_KEY)
    } else {
      privateKeyArray = Array.from(bs58.default.decode(process.env.CREATOR_PRIVATE_KEY))
    }

    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))

    const balance = await connection.getBalance(creatorKeypair.publicKey)
    if (balance < 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(`Insufficient SOL in creator wallet. Balance: ${balance / LAMPORTS_PER_SOL} SOL`)
    }

    const umi = createUmi(SOLANA_RPC_URL).use(mplCore())
    const umiKeypair = fromWeb3JsKeypair(creatorKeypair)
    const creatorUmi = umi.use(keypairIdentity(umiKeypair))

    const asset = generateSigner(creatorUmi)

    let collectionConfig = none()
    if (metadata.collection && metadata.collection.trim()) {
      try {
        const collectionPubkey = publicKey(metadata.collection.trim())
        collectionConfig = some({ key: collectionPubkey, verified: false })
      } catch (error) {
        console.log("Invalid collection address, proceeding without collection")
      }
    }

    const createInstruction = createV1(creatorUmi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      uri: metadataUrl,
      collection: collectionConfig,
    })

    const result = await createInstruction.sendAndConfirm(creatorUmi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: false },
    })

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
    console.error("Mint NFT error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
