import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplTokenMetadata, create } from '@metaplex-foundation/mpl-token-metadata';
import { publicKey, keypairIdentity, generateSigner } from '@metaplex-foundation/umi';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { fromWeb3JsPublicKey, toWeb3JsKeypair } from '@metaplex-foundation/umi-web3js-adapters';
import axios from 'axios';
import bs58 from 'bs58';
import { Buffer } from 'buffer';

// Polyfill Buffer for Vercel environment
globalThis.Buffer = Buffer;

export default async function handler(req, res) {
  // Set CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');  // Or specify your domain
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight request
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { walletAddress, metadata } = req.body;

    // Validate input data
    if (!walletAddress || !metadata || !metadata.image || !metadata.name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: walletAddress, metadata.image, metadata.name',
      });
    }

    // Initialize Solana connection
    const connection = new Connection(
      process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com',
      'confirmed'
    );

    // Load creator's private key and validate
    let privateKeyArray;
    try {
      const privateKey = process.env.CREATOR_PRIVATE_KEY?.trim();
      if (!privateKey) {
        throw new Error('CREATOR_PRIVATE_KEY is not defined');
      }
      if (privateKey.startsWith('[')) {
        privateKeyArray = JSON.parse(privateKey);
      } else {
        privateKeyArray = Array.from(bs58.decode(privateKey));
      }
    } catch (error) {
      console.error('Invalid CREATOR_PRIVATE_KEY:', error.message);
      return res.status(500).json({ success: false, error: 'Invalid CREATOR_PRIVATE_KEY format' });
    }

    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    console.log('✅ Creator wallet loaded:', creatorKeypair.publicKey.toString());

    // Check creator's SOL balance before proceeding
    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);
    if (balanceBefore < 0.001 * 1e9) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL. Balance: ${balanceBefore / 1e9} SOL.`,
      });
    }

    // Step 1: Upload metadata to IPFS using Pinata
    console.log('📤 Step 1: Uploading metadata to IPFS...');
    let metadataUri;
    try {
      const nftMetadata = {
        name: metadata.name,
        description: metadata.description || 'NFT created via WordPress store',
        image: metadata.image,
        attributes: [
          { trait_type: 'Product ID', value: String(metadata.product_id || 'unknown') },
          { trait_type: 'Platform', value: 'WordPress' },
          { trait_type: 'Creator', value: 'WordPress Store' },
          { trait_type: 'Minted Date', value: new Date().toISOString().split('T')[0] },
        ],
        properties: {
          files: [{ uri: metadata.image, type: 'image/png' }],
          category: 'image',
        },
      };

      const pinataResponse = await axios.post(
        'https://api.pinata.cloud/pinning/pinJSONToIPFS',
        {
          pinataContent: nftMetadata,
          pinataMetadata: { name: `wordpress-nft-metadata-${Date.now()}.json` },
        },
        {
          headers: {
            pinata_api_key: process.env.PINATA_API_KEY,
            pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
          },
          timeout: 30000,
        }
      );

      metadataUri = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`;
      console.log('✅ Metadata uploaded to IPFS:', metadataUri);
    } catch (ipfsError) {
      console.error('❌ IPFS upload failed:', ipfsError.message);
      return res.status(500).json({
        success: false,
        error: 'Metadata upload failed - transaction cancelled',
      });
    }

    // Step 2: Initialize UMI and create NFT
    console.log('⚡ Step 2: Creating NFT with UMI...');
    const umi = createUmi(connection).use(mplTokenMetadata());
    const umiCreatorKeypair = keypairIdentity(toWeb3JsKeypair(creatorKeypair));
    umi.use(umiCreatorKeypair);

    const mint = generateSigner(umi);
    const recipientPubkey = publicKey(walletAddress);

    try {
      const tx = await create(umi, {
        mint,
        authority: umi.identity,
        name: metadata.name,
        uri: metadataUri,
        sellerFeeBasisPoints: 500, // 5%
        creators: [
          {
            address: fromWeb3JsPublicKey(creatorKeypair.publicKey),
            verified: true,
            share: 100,
          },
        ],
      }).sendAndConfirm(umi, { send: { commitment: 'confirmed' } });

      const signature = Buffer.from(tx.signature).toString('base64');
      console.log('✅ NFT created! Signature:', signature);

      // Step 3: Calculate costs
      const balanceAfter = await connection.getBalance(creatorKeypair.publicKey);
      const totalCostSOL = (balanceBefore - balanceAfter) / 1e9;

      console.log('🔥 === NFT Minted Successfully ===');
      console.log('🔗 Mint address:', mint.publicKey);
      console.log('📝 Transaction signature:', signature);
      console.log('🌐 Metadata URI:', metadataUri);
      console.log('💰 Total cost:', totalCostSOL, 'SOL');

      return res.status(200).json({
        success: true,
        mintAddress: mint.publicKey.toString(),
        transactionSignature: signature,
        metadataUri,
        explorerUrl: `https://explorer.solana.com/address/${mint.publicKey.toString()}?cluster=mainnet-beta`,
        message: 'NFT successfully minted with full metadata!',
        costs: {
          totalSOL: totalCostSOL,
          totalUSD: totalCostSOL * 165, // Adjust USD conversion rate as needed
        },
      });
    } catch (metaplexError) {
      console.error('❌ NFT creation failed:', metaplexError.message);
      return res.status(500).json({
        success: false,
        error: 'Metadata creation failed - NFT incomplete',
      });
    }
  } catch (error) {
    console.error('❌ COMPLETE FAILURE:', error);
    return res.status(500).json({
      success: false,
      error: `NFT creation failed: ${error.message}`,
    });
  }
}
