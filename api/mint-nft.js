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

    console.log("🎨 === SIMPLE WORKING NFT MINTING ===");

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      });
    }

    // STRICT REQUIREMENTS
    if (!metadata.image || !metadata.name) {
      console.error("❌ FAILED: Missing required image or name");
      return res.status(400).json({
        success: false,
        error: "NFT image and name are REQUIRED for paid NFTs",
      });
    }

    // Import libraries
    const { Connection, PublicKey, Keypair } = await import("@solana/web3.js");
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

    // Check balance
    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);
    if (balanceBefore < 0.001 * 1e9) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL. Balance: ${balanceBefore / 1e9} SOL.`
      });
    }

    // Step 1: Upload metadata to IPFS FIRST
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
      console.log("✅ Metadata uploaded to IPFS:", metadataUri);

    } catch (ipfsError) {
      console.error("❌ FAILED: IPFS upload failed:", ipfsError.message);
      return res.status(500).json({
        success: false,
        error: "Metadata upload failed - transaction cancelled",
      });
    }

    // Step 2: Use high-level Metaplex createNft function
    console.log("🚀 Step 2: Creating NFT with high-level Metaplex function...");
    
    try {
      const metaplexLib = await import("@metaplex-foundation/mpl-token-metadata");
      
      console.log("✅ Using createNft function");
      
      // Use the high-level createNft function that handles everything
      const result = await metaplexLib.createNft(connection, {
        name: metadata.name,
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
      }, {
        payer: creatorKeypair,
        mintAuthority: creatorKeypair,
        updateAuthority: creatorKeypair,
        owner: new PublicKey(walletAddress),
      });

      console.log("✅ NFT created with createNft function:", result);
      
      // Cost tracking
      const balanceAfter = await connection.getBalance(creatorKeypair.publicKey);
      const totalCostSOL = (balanceBefore - balanceAfter) / 1e9;

      console.log("🎉 === COMPLETE NFT WITH METADATA CREATED ===");
      console.log("🔗 Mint address:", result.mint.toString());
      console.log("🌐 Metadata URI:", metadataUri);
      console.log("💰 Total cost:", totalCostSOL, "SOL");

      return res.status(200).json({
        success: true,
        mintAddress: result.mint.toString(),
        transactionSignature: result.mintSignature || result.signature,
        metadataUri: metadataUri,
        explorerUrl: `https://explorer.solana.com/address/${result.mint.toString()}`,
        message: "COMPLETE NFT with full metadata created successfully!",
        costs: {
          totalSOL: totalCostSOL,
          totalUSD: totalCostSOL * 165
        }
      });

    } catch (metaplexError) {
      console.error("❌ High-level NFT creation failed:", metaplexError.message);
      
      // If high-level function fails, we still protect customers
      return res.status(500).json({
        success: false,
        error: "NFT creation failed - transaction cancelled",
      });
    }

  } catch (error) {
    console.error("❌ COMPLETE FAILURE:", error);
    return res.status(500).json({
      success: false,
      error: "NFT creation failed: " + error.message,
    });
  }
}
