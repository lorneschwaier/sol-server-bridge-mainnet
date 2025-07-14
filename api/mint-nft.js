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

    console.log("🔥 === FINAL WORKING NFT WITH METADATA ===");

    if (!walletAddress || !metadata || !metadata.image || !metadata.name) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress, metadata.image, metadata.name"
      });
    }

    const { Connection, PublicKey, Keypair } = await import("@solana/web3.js");
    const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = await import("@solana/spl-token");
    const bs58 = (await import("bs58")).default;
    const axios = (await import("axios")).default;

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

    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);
    console.log("💰 Creator wallet balance:", balanceBefore / 1e9, "SOL");
    
    if (balanceBefore < 0.02 * 1e9) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL for NFT creation. Balance: ${balanceBefore / 1e9} SOL. Need at least 0.02 SOL.`
      });
    }

    // Step 1: Upload metadata to IPFS
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
          files: [{ uri: metadata.image, type: "image/png" }],
          category: "image"
        }
      };

      const pinataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          pinataContent: nftMetadata,
          pinataMetadata: { name: `wordpress-nft-metadata-${Date.now()}.json` }
        },
        {
          headers: {
            pinata_api_key: process.env.PINATA_API_KEY,
            pinata_secret_api_key: process.env.PINATA_SECRET_KEY
          },
          timeout: 30000
        }
      );

      metadataUri = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`;
      console.log("✅ Metadata uploaded to IPFS:", metadataUri);

    } catch (ipfsError) {
      console.error("❌ IPFS upload failed:", ipfsError.message);
      return res.status(500).json({
        success: false,
        error: "Metadata upload failed - transaction cancelled"
      });
    }

    // Step 2: Create mint
    console.log("⚡ Step 2: Creating mint...");
    const mint = await createMint(
      connection,
      creatorKeypair,
      creatorKeypair.publicKey,
      creatorKeypair.publicKey,
      0
    );

    console.log("🔑 Mint created:", mint.toString());

    // Step 3: Create metadata using the EXACT function that exists
    console.log("📝 Step 3: Creating metadata account with correct function...");

    try {
      const metaplexLib = await import("@metaplex-foundation/mpl-token-metadata");
      
      // Use the EXACT function from our debug output
      const METADATA_PROGRAM_ID = new PublicKey(metaplexLib.MPL_TOKEN_METADATA_PROGRAM_ID);
      
      console.log("✅ Using the EXACT function that exists: createMetadataAccountV3");
      console.log("🔍 METADATA_PROGRAM_ID:", METADATA_PROGRAM_ID.toString());
      
      // Find metadata account PDA
      const [metadataAccount] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );

      console.log("📍 Metadata account PDA:", metadataAccount.toString());

      // Create metadata using the simple approach
      const result = await metaplexLib.createMetadataAccountV3(
        connection,
        creatorKeypair,
        mint,
        creatorKeypair.publicKey,
        creatorKeypair.publicKey,
        {
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
        },
        true, // isMutable
        creatorKeypair.publicKey // updateAuthority
      );
      
      console.log("✅ Metadata account created! Result:", result);

    } catch (metaplexError) {
      console.error("❌ Metadata creation failed:", metaplexError.message);
      console.error("❌ Full error:", metaplexError);
      return res.status(500).json({
        success: false,
        error: "Metadata creation failed - NFT incomplete. Contact support for refund with mint: " + mint.toString()
      });
    }

    // Step 4: Mint token to recipient
    console.log("🚀 Step 4: Minting token to recipient...");
    const recipientPubkey = new PublicKey(walletAddress);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      creatorKeypair,
      mint,
      recipientPubkey
    );

    const mintSignature = await mintTo(
      connection,
      creatorKeypair,
      mint,
      tokenAccount.address,
      creatorKeypair.publicKey,
      1
    );

    const balanceAfter = await connection.getBalance(creatorKeypair.publicKey);
    const totalCostSOL = (balanceBefore - balanceAfter) / 1e9;

    console.log("🔥 === COMPLETE NFT WITH FULL METADATA CREATED ===");
    console.log("🔗 Mint address:", mint.toString());
    console.log("📝 Mint signature:", mintSignature);
    console.log("🌐 Metadata URI:", metadataUri);
    console.log("💰 Total cost:", totalCostSOL, "SOL");
    console.log("💰 Remaining balance:", balanceAfter / 1e9, "SOL");

    return res.status(200).json({
      success: true,
      mintAddress: mint.toString(),
      transactionSignature: mintSignature,
      metadataUri: metadataUri,
      explorerUrl: `https://explorer.solana.com/address/${mint.toString()}`,
      magicEdenUrl: `https://magiceden.io/item-details/${mint.toString()}`,
      message: "COMPLETE NFT with full metadata created successfully!",
      costs: {
        totalSOL: totalCostSOL,
        totalUSD: totalCostSOL * 165,
        remainingSOL: balanceAfter / 1e9
      }
    });

  } catch (error) {
    console.error("❌ COMPLETE FAILURE:", error);
    return res.status(500).json({
      success: false,
      error: "NFT creation failed: " + error.message
    });
  }
}
