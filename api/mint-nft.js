// Required for buffer-based deps on Vercel
globalThis.Buffer = globalThis.Buffer || require('buffer').Buffer;

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createNft } from '@metaplex-foundation/mpl-token-metadata';
import {
  keypairIdentity,
  generateSigner
} from '@metaplex-foundation/umi';
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';

export default async function handler(req, res) {
  // ✅ CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // ✅ Handle CORS preflight
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { walletAddress, metadata } = req.body;

    if (!walletAddress || !metadata) {
      return res.status(400).json({ success: false, error: 'Missing walletAddress or metadata' });
    }

    // 🔐 Load your private key from Vercel env
    const secretKey = JSON.parse(process.env.SOLANA_PRIVATE_KEY);
    const umi = createUmi(process.env.SOLANA_RPC_URL);
    const payer = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretKey));
    umi.use(keypairIdentity(payer));

    // 🎨 Mint NFT
    const mint = generateSigner(umi);
    const {
      name = 'X1XO NFT',
      symbol = 'X1XO',
      uri
    } = metadata;

    if (!uri || !name) {
      return res.status(400).json({ success: false, error: 'Missing name or uri in metadata' });
    }

    const nft = await createNft(umi, {
      mint,
      name,
      uri,
      symbol,
      sellerFeeBasisPoints: 500,
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
    }).sendAndConfirm(umi);

    return res.status(200).json({
      success: true,
      mintAddress: mint.publicKey.toString(),
      transactionSignature: nft.signature.toString(),
      message: 'NFT minted successfully on Solana!'
    });

  } catch (error) {
    console.error('❌ Minting failed:', error);
    return res.status(500).json({ success: false, error: error.message || 'Minting failed' });
  }
}
