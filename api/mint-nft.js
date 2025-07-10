export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

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
        error: "Missing required fields",
        required: ["name", "description", "image", "recipient"],
      })
    }

    // Dynamic imports to reduce cold start time
    const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults")
    const { mplCore, createV1, ruleSet } = await import("@metaplex-foundation/mpl-core")
    const { createSignerFromKeypair, signerIdentity, generateSigner, publicKey } = await import(
      "@metaplex-foundation/umi"
    )
    const { fromWeb3JsKeypair } = await import("@metaplex-foundation/umi-web3js-adapters")
    const { Keypair } = await import("@solana/web3.js")
    const bs58 = await import("bs58")
    const axios = await import("axios")

    // Initialize UMI
    const umi = createUmi(process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com").use(mplCore())

    // Load creator keypair
    const creatorKeypair = Keypair.fromSecretKey(bs58.default.decode(process.env.CREATOR_PRIVATE_KEY))
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

    const pinataResponse = await axios.default.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", metadata, {
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: process.env.PINATA_API_KEY,
        pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
      },
    })

    const metadataUri = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`

    // Generate asset keypair
    const asset = generateSigner(umi)

    // Create NFT
    const tx = await createV1(umi, {
      asset,
      name,
      uri: metadataUri,
      owner: publicKey(recipient),
      plugins: [
        {
          type: "Royalties",
          basisPoints: 500, // 5%
          creators: [
            {
              address: creatorSigner.publicKey,
              percentage: 100,
            },
          ],
          ruleSet: ruleSet("None"),
        },
      ],
    }).sendAndConfirm(umi)

    const signature = bs58.default.encode(tx.signature)

    res.status(200).json({
      success: true,
      signature,
      asset: asset.publicKey,
      metadataUri,
      explorer: `https://explorer.solana.com/tx/${signature}?cluster=${process.env.SOLANA_NETWORK === "mainnet-beta" ? "mainnet" : "devnet"}`,
    })
  } catch (error) {
    console.error("Minting error:", error)
    res.status(500).json({
      error: "Minting failed",
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}
