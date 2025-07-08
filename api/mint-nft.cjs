const { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, clusterApiUrl } = require("@solana/web3.js")
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults")
const { createNft, mplTokenMetadata } = require("@metaplex-foundation/mpl-token-metadata")
const { createSignerFromKeypair, signerIdentity, generateSigner, publicKey } = require("@metaplex-foundation/umi")
const bs58 = require("bs58")
const axios = require("axios")
const FormData = require("form-data")

const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK)
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY
const PINATA_API_KEY = process.env.PINATA_API_KEY
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY
const COLLECTION_MINT_ADDRESS = process.env.COLLECTION_MINT_ADDRESS

const connection = new Connection(SOLANA_RPC_URL, "confirmed")
let umi = null
let signer = null

function initUmi() {
  const privateKeyArray = CREATOR_PRIVATE_KEY.startsWith("[")
    ? JSON.parse(CREATOR_PRIVATE_KEY)
    : Array.from(bs58.decode(CREATOR_PRIVATE_KEY))

  const umiKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
  umi = createUmi(SOLANA_RPC_URL)
  const umiSigner = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(privateKeyArray))
  signer = createSignerFromKeypair(umi, umiSigner)
  umi.use(signerIdentity(signer))
  umi.use(mplTokenMetadata())
  console.log("✅ UMI signer ready:", signer.publicKey.toString())
}

initUmi()

async function uploadToPinata(imageUrl) {
  const response = await axios.get(imageUrl, { responseType: "stream" })
  const ext = imageUrl.split(".").pop().split("?")[0]
  const filename = `nft-image-${Date.now()}.${ext}`

  const form = new FormData()
  form.append("file", response.data, {
    filename,
    contentType: response.headers["content-type"] || "image/png",
  })

  form.append("pinataMetadata", JSON.stringify({ name: filename }))

  const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
    headers: {
      ...form.getHeaders(),
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
  })

  return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`
}

async function uploadMetadataToPinata(metadata) {
  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    {
      pinataContent: metadata,
      pinataMetadata: { name: `nft-metadata-${Date.now()}.json` },
    },
    {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    }
  )

  return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`
}

async function createNFT(walletAddress, metadataUri, metadata) {
  const mint = generateSigner(umi)
  const tokenOwner = publicKey(walletAddress)
  const collection = COLLECTION_MINT_ADDRESS ? { key: publicKey(COLLECTION_MINT_ADDRESS), verified: true } : undefined

  const tx = await createNft(umi, {
    mint,
    name: metadata.name || "Unnamed",
    symbol: metadata.symbol || "NFT",
    uri: metadataUri,
    sellerFeeBasisPoints: (metadata.royalty || 0) * 100,
    creators: [
      {
        address: signer.publicKey,
        verified: true,
        share: 100,
      },
    ],
    tokenOwner,
    collection,
    isMutable: true,
    updateAuthority: signer,
    mintAuthority: signer,
    payer: signer,
  }).sendAndConfirm(umi)

  return {
    mint: mint.publicKey.toString(),
    signature: tx.signature,
    explorer: `https://explorer.solana.com/address/${mint.publicKey}${
      SOLANA_NETWORK === "mainnet-beta" ? "" : `?cluster=${SOLANA_NETWORK}`
    }`,
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") return res.status(200).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  try {
    const { walletAddress, metadata } = req.body
    if (!walletAddress || !metadata) {
      return res.status(400).json({ success: false, error: "Missing walletAddress or metadata" })
    }

    const balance = await connection.getBalance(signer.publicKey)
    if (balance < 0.005 * LAMPORTS_PER_SOL) {
      throw new Error("Bridge wallet has insufficient SOL to mint NFT")
    }

    const imageUrl = metadata.image.startsWith("http") ? await uploadToPinata(metadata.image) : metadata.image

    const fullMetadata = {
      name: metadata.name,
      symbol: metadata.symbol,
      image: imageUrl,
      seller_fee_basis_points: (metadata.royalty || 0) * 100,
      properties: {
        creators: [
          {
            address: signer.publicKey.toString(),
            share: 100,
          },
        ],
      },
    }

    const metadataUri = await uploadMetadataToPinata(fullMetadata)
    const nft = await createNFT(walletAddress, metadataUri, fullMetadata)

    return res.status(200).json({
      success: true,
      mint_address: nft.mint,
      transaction_signature: nft.signature,
      explorer_url: nft.explorer,
      uri: metadataUri,
    })
  } catch (err) {
    console.error("❌ NFT minting error:", err)
    return res.status(500).json({
      success: false,
      error: err.message || "Unknown error",
    })
  }
}
