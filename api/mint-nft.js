// Buffer polyfill fix for Vercel
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { walletAddress, metadata } = req.body;

    console.log("🎨 === REAL NFT MINTING REQUEST ===");
    console.log("👤 Wallet:", walletAddress);

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      });
    }

    // Check environment variables
    if (!process.env.CREATOR_PRIVATE_KEY) {
      return res.status(500).json({
        success: false,
        error: "CREATOR_PRIVATE_KEY not configured",
      });
    }

    if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: "Pinata API credentials not configured",
      });
    }

    // Dynamic imports with better error handling
    const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
    const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults");
    const { createV1, mplCore } = await import("@metaplex-foundation/mpl-core");
    const { keypairIdentity, generateSigner, publicKey, some, none } = await import("@metaplex-foundation/umi");
    const { fromWeb3JsKeypair } = await import("@metaplex-foundation/umi-web3js-adapters");
    const axios = (await import("axios")).default;
    const bs58 = (await import("bs58")).default;

    // Environment variables
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta";
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK));

    // Validate wallet address
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "Invalid wallet address format",
      });
    }

    // Step 1: Upload metadata to Pinata
    console.log("📤 Step 1: Uploading metadata to Pinata...");

    const pinataResponse = await axios.post(
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
      }
    );

    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`;
    console.log("✅ Metadata uploaded to Pinata:", metadataUrl);

    // Step 2: Initialize Solana connection and mint NFT
    console.log("⚡ Step 2: Minting REAL NFT on Solana...");

    const connection = new Connection(SOLANA_RPC_URL, "confirmed");

    // Parse private key with better Buffer handling
    let privateKeyArray;
    try {
      if (process.env.CREATOR_PRIVATE_KEY.startsWith("[")) {
        privateKeyArray = JSON.parse(process.env.CREATOR_PRIVATE_KEY);
      } else {
        const decoded = bs58.decode(process.env.CREATOR_PRIVATE_KEY);
        privateKeyArray = Array.from(decoded);
      }
    } catch (error) {
      console.error("❌ Private key parsing error:", error);
      return res.status(500).json({
        success: false,
        error: "Invalid CREATOR_PRIVATE_KEY format"
      });
    }

    // Create Web3.js keypair
    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString());

    // Check creator wallet balance
    const balance = await connection.getBalance(creatorKeypair.publicKey);
    console.log("💰 Creator wallet balance:", balance / LAMPORTS_PER_SOL, "SOL");

    if (balance < 0.01 * LAMPORTS_PER_SOL) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL in creator wallet. Balance: ${balance / LAMPORTS_PER_SOL} SOL. Please fund the wallet.`
      });
    }

    // Initialize UMI with Metaplex Core
    const umi = createUmi(SOLANA_RPC_URL).use(mplCore());
    const umiKeypair = fromWeb3JsKeypair(creatorKeypair);
    const creatorUmi = umi.use(keypairIdentity(umiKeypair));

    // Generate asset signer
    const asset = generateSigner(creatorUmi);
    console.log("🔑 Generated asset address:", asset.publicKey);

    console.log("⚡ Creating REAL NFT with Metaplex Core...");

    // Create the NFT using Metaplex Core
    const createInstruction = createV1(creatorUmi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      uri: metadataUrl,
      collection: none(),
    });

    // Execute the transaction
    console.log("📡 Submitting REAL NFT transaction to Solana mainnet...");
    const result = await createInstruction.sendAndConfirm(creatorUmi, {
      confirm: { commitment: "confirmed" },
      send: { skipPreflight: false },
    });

    console.log("🎉 === REAL NFT MINTED SUCCESSFULLY ON MAINNET! ===");
    console.log("🔗 Asset address:", asset.publicKey);
    console.log("📝 Transaction signature:", result.signature);

    const explorerUrl = `https://explorer.solana.com/address/${asset.publicKey}`;

    return res.status(200).json({
      success: true,
      mintAddress: asset.publicKey,
      transactionSignature: result.signature,
      metadataUrl: metadataUrl,
      explorerUrl: explorerUrl,
      network: SOLANA_NETWORK,
      method: "metaplex_core_mainnet",
      message: "REAL NFT minted successfully on Solana mainnet!",
    });

  } catch (error) {
    console.error("❌ REAL NFT Mint error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}
