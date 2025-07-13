// Buffer polyfill for Vercel
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { walletAddress, metadata } = req.body;

    console.log("🎨 === GUARANTEED NFT WITH METADATA ===");

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      });
    }

    // REQUIRE image and name for paid NFTs
    if (!metadata.image || !metadata.name) {
      return res.status(400).json({
        success: false,
        error: "NFT image and name are required for paid NFTs",
      });
    }

    // Import libraries
    const { Connection, PublicKey, Keypair, Transaction } = await import("@solana/web3.js");
    const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = await import("@solana/spl-token");
    const bs58 = (await import("bs58")).default;
    const axios = (await import("axios")).default;

    // Initialize connection
    const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

    // Parse private key
    let privateKeyArray;
    try {
      const privateKey = process.env.CREATOR_PRIVATE_KEY.trim();
      if (privateKey.startsWith("[")) {
        privateKeyArray = JSON.parse(privateKey);
      } else {
        const decoded = bs58.decode(privateKey);
        privateKeyArray = Array.from(decoded);
      }
    } catch (error) {
      return res.status(500).json({ success: false, error: "Invalid CREATOR_PRIVATE_KEY format" });
    }

    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString());

    // Check balance - reduced threshold
    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);
    if (balanceBefore < 0.001 * 1e9) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL. Balance: ${balanceBefore / 1e9} SOL.`
      });
    }

    // Step 1: Upload metadata to IPFS FIRST - MUST SUCCEED
    console.log("📤 Step 1: Uploading metadata to IPFS...");
    
    let metadataUri;
    try {
      const nftMetadata = {
        name: metadata.name,
        description: metadata.description || "NFT created via WordPress store",
        image: metadata.image,
        attributes: [
          { trait_type: "Product ID", value: String(metadata.product_id || "unknown") },
          { trait_type: "Platform", value: "WordPress" },
          { trait_type: "Creator", value: "WordPress Store" },
          { trait_type: "Minted Date", value: new Date().toISOString().split('T')[0] }
        ],
        properties: {
          files: [
            {
              uri: metadata.image,
              type: "image/png"
            }
          ],
          category: "image"
        }
      };

      console.log("📋 NFT Metadata being uploaded:", nftMetadata);

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
            pinata_api_key: process.env.PINATA_API_KEY,
            pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
          },
          timeout: 30000,
        }
      );

      metadataUri = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`;
      console.log("✅
