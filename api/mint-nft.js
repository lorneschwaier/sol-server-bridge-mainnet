// Required for buffer-based deps
globalThis.Buffer = globalThis.Buffer || require('buffer').Buffer

export default async function handler(req, res) {
  // ✅ Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  // ✅ Respond to OPTIONS request (preflight)
  if (req.method === "OPTIONS") return res.status(200).end()

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" })
  }

  try {
    // ... your minting logic ...
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message })
  }
}


import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createNft, setAndVerifyCollection } from '@metaplex-foundation/mpl-token-metadata'
import { keypairIdentity, generateSigner, percentAmount } from '@metaplex-foundation/umi'
import base58 from 'bs58'
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'

// Set up Buffer in Vercel environment
globalThis.Buffer = globalThis.Buffer || require('buffer').Buffer

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { walletAddress, metadata } = req.body

    // 🔐 Load your private key (from env var or inline for testing)
    const secretKey = JSON.parse(process.env.SOLANA_PRIVATE_KEY)
    const payer = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey))

    // 🔗 Connect to mainnet or devnet
    const umi = createUmi(process.env.SOLANA_RPC_URL)
    umi.use(keypairIdentity(payer))

    // 🎨 Create mint keypair and NFT
    const mint = generateSigner(umi)

    const { name, symbol = 'X1X', description, image, attributes = [] } = metadata

    // Upload metadata to IPFS or Arweave ahead of time — here we assume it's passed as a URI already
    const uri = metadata.uri || 'ipfs://example.com/metadata.json'

    const nft = await createNft(umi, {
      mint,
      name,
      uri,
      symbol,
      sellerFeeBasisPoints: 500, // 5% royalties
      decimals: 0,
      isMutable: true,
      creators: [
        {
          address: payer.publicKey,
          verified: true,
          share: 100,
        }
      ],
      tokenOwner: fromWeb3JsPublicKey(walletAddress)
    }).sendAndConfirm(umi)

    return res.status(200).json({
      success: true,
      mintAddress: mint.publicKey.toString(),
      transactionSignature: nft.signature.toString(),
      message: 'NFT minted successfully on Solana mainnet!'
    })

  } catch (error) {
    console.error('❌ Minting failed:', error)
    return res.status(500).json({ success: false, error: error.message || 'Minting failed' })
  }
}
