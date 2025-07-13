// api/mint-nft.js

import { Buffer } from 'buffer';
import { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { createV1, mplCore } from "@metaplex-foundation/mpl-core";
import { keypairIdentity, generateSigner, publicKey as umiPublicKey, some, none } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import axios from "axios";
import bs58 from "bs58";

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { walletAddress, metadata } = req.body;
    if (!walletAddress || !metadata) {
      return res.status(400).json({ success: false, error: "Missing walletAddress or metadata" });
    }

    // Validate wallet
    try {
      new PublicKey(walletAddress);
    } catch {
      return res.status(400).json({ success: false, error: "Invalid wallet address format" });
    }

    // Pinata keys
    if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_KEY) {
      return res.status(500).json({ success: false, error: "Pinata API credentials not configured" });
    }

    // Upload metadata
    const pinataRes = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS", { pinataContent: metadata }, {
        headers: {
          pinata_api_key: process.env.PINATA_API_KEY,
          pinata_secret_api_key: process.env.PINATA_SECRET_KEY
        }
      }
    );
    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${pinataRes.data.IpfsHash}`;

    // Solana network & RPC
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta";
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL ||
      (SOLANA_NETWORK === "mainnet-beta"
        ? "https://api.mainnet-beta.solana.com"
        : clusterApiUrl(SOLANA_NETWORK));

    // Load creator keypair
    let secretKey;
    if (process.env.CREATOR_PRIVATE_KEY.startsWith("[")) {
      secretKey = Buffer.from(JSON.parse(process.env.CREATOR_PRIVATE_KEY));
    } else {
      secretKey = Buffer.from(bs58.decode(process.env.CREATOR_PRIVATE_KEY));
    }
    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(secretKey));

    // Connection & UMI
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    const umi = createUmi(SOLANA_RPC_URL).use(mplCore());
    const umiKey = fromWeb3JsKeypair(creatorKeypair);
    const creatorUmi = umi.use(keypairIdentity(umiKey));
    const asset = generateSigner(creatorUmi);

    // Collection config
    let collectionConfig = none();
    if (metadata.collection) {
      try {
        const colPub = umiPublicKey(metadata.collection.trim());
        collectionConfig = some({ key: colPub, verified: false });
      } catch { /* skip */ }
    }

    // Build and send mint instruction
    const createIx = createV1(creatorUmi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      symbol: metadata.symbol || "XENO",
      uri: metadataUrl,
      sellerFeeBasisPoints: metadata.sellerFeeBasisPoints || 0,
      collection: collectionConfig
    });

    const result = await createIx.sendAndConfirm(creatorUmi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: false }
    });

    return res.status(200).json({
      success: true,
      mintAddress: asset.publicKey,
      transactionSignature: result.signature,
      metadataUrl,
      network: SOLANA_NETWORK
    });

  } catch (error) {
    console.error("❌ Mint NFT error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
// Add this at the very top of your mint-nft.js file
import { Buffer } from 'buffer';
if (typeof globalThis !== 'undefined' && !globalThis.Buffer) {
    globalThis.Buffer = Buffer;
}
if (typeof global !== 'undefined' && !global.Buffer) {
    global.Buffer = Buffer;
}
