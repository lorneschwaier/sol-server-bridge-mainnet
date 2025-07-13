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

    console.log("🎨 === STRICT NFT MINTING - METADATA REQUIRED ===");

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      });
    }

    // STRICT REQUIREMENTS - FAIL IF MISSING
    if (!metadata.image || !metadata.name) {
      console.error("❌ FAILED: Missing required image or name");
      return res.status(400).json({
        success: false,
        error: "NFT image and name are REQUIRED for paid NFTs",
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

    // Check balance
    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);
    if (balanceBefore < 0.001 * 1e9) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL. Balance: ${balanceBefore / 1e9} SOL.`
      });
    }

    // Step 1: VERIFY METAPLEX IMPORTS - Fixed verification logic
    console.log("🔍 Step 1: VERIFYING Metaplex imports...");
    
    let createCreateMetadataAccountV3Instruction, METADATA_PROGRAM_ID;
    try {
      console.log("📦 Importing Metaplex library...");
      const metaplexLib = await import("@metaplex-foundation/mpl-token-metadata");
      
      console.log("📋 Available functions:", Object.keys(metaplexLib).slice(0, 10));
      
      // Use the CORRECT function names from the debug output
      createCreateMetadataAccountV3Instruction = metaplexLib.createMetadataAccountV3;
        
      // Use the CORRECT PROGRAM_ID name and convert to PublicKey if needed
      const programIdValue = metaplexLib.MPL_TOKEN_METADATA_PROGRAM_ID;
      METADATA_PROGRAM_ID = typeof programIdValue === 'string' ? new PublicKey(programIdValue) : programIdValue;
      
      console.log("🔍 createMetadataAccountV3:", typeof createCreateMetadataAccountV3Instruction);
      console.log("🔍 MPL_TOKEN_METADATA_PROGRAM_ID type:", typeof programIdValue);
      console.log("🔍 MPL_TOKEN_METADATA_PROGRAM_ID value:", programIdValue);
      console.log("🔍 Final METADATA_PROGRAM_ID:", METADATA_PROGRAM_ID ? METADATA_PROGRAM_ID.toString() : "undefined");
      
      if (typeof createCreateMetadataAccountV3Instruction !== 'function') {
        console.log("❌ Function not found, available functions:", Object.keys(metaplexLib).filter(key => key.toLowerCase().includes('metadata')));
        throw new Error("createCreateMetadataAccountV3Instruction is not a function");
      }
      
      if (!METADATA_PROGRAM_ID || typeof METADATA_PROGRAM_ID.toBuffer !== 'function') {
        console.log("❌ PROGRAM_ID not found, available PROGRAM_IDs:", Object.keys(metaplexLib).filter(key => key.includes('PROGRAM')));
        throw new Error("METADATA_PROGRAM_ID is invalid or missing toBuffer method");
      }
      
      console.log("✅ Metaplex imports verified successfully");
    } catch (metaplexImportError) {
      console.error("❌ FAILED: Metaplex imports failed:", metaplexImportError.message);
      return res.status(500).json({
        success: false,
        error: "Metadata system unavailable - transaction cancelled",
      });
    }

    // Step 2: UPLOAD METADATA TO IPFS - REQUIRED TO SUCCEED
    console.log("📤 Step 2: Uploading metadata to IPFS - REQUIRED...");
    
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

    // Step 3: CREATE MINT - Only after verifying everything will work
    console.log("⚡ Step 3: Creating mint...");
    const mint = await createMint(
      connection,
      creatorKeypair,
      creatorKeypair.publicKey,
      creatorKeypair.publicKey,
      0 // 0 decimals for NFT
    );

    console.log("🔑 Mint created:", mint.toString());

    // Step 4: CREATE METADATA ACCOUNT - MUST SUCCEED OR COMPLETE FAILURE
    console.log("📝 Step 4: Creating Metaplex metadata account - REQUIRED...");
    
    try {
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

      // Create metadata account instruction using the correct function
      const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataAccount,
          mint: mint,
          mintAuthority: creatorKeypair.publicKey,
          payer: creatorKeypair.publicKey,
          updateAuthority: creatorKeypair.publicKey,
        },
        {
          data: {
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
          isMutable: true,
          collectionDetails: null,
        }
      );

      // Send metadata transaction
      const metadataTransaction = new Transaction().add(createMetadataInstruction);
      
      const metadataSignature = await connection.sendTransaction(metadataTransaction, [creatorKeypair]);
      await connection.confirmTransaction(metadataSignature);
      
      console.log("✅ Metadata account created! Signature:", metadataSignature);

    } catch (metaplexError) {
      console.error("❌ FAILED: Metadata creation failed:", metaplexError.message);
      console.error("❌ Metadata Error Details:", metaplexError);
      
      // CRITICAL FAILURE - The mint exists but has no metadata
      // This is unacceptable for paying customers
      return res.status(500).json({
        success: false,
        error: "Metadata creation failed - NFT incomplete. Contact support for refund with mint: " + mint.toString(),
      });
    }

    // Step 5: MINT TOKEN TO RECIPIENT - Only if everything succeeded
    console.log("🚀 Step 5: Minting token to recipient...");
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

    // Cost tracking
    const balanceAfter = await connection.getBalance(creatorKeypair.publicKey);
    const totalCostSOL = (balanceBefore - balanceAfter) / 1e9;

    console.log("🎉 === COMPLETE NFT WITH FULL METADATA CREATED ===");
    console.log("🔗 Mint address:", mint.toString());
    console.log("📝 Mint signature:", mintSignature);
    console.log("🌐 Metadata URI:", metadataUri);
    console.log("💰 Total cost:", totalCostSOL, "SOL");

    return res.status(200).json({
      success: true,
      mintAddress: mint.toString(),
      transactionSignature: mintSignature,
      metadataUri: metadataUri,
      explorerUrl: `https://explorer.solana.com/address/${mint.toString()}`,
      message: "COMPLETE NFT with full metadata created successfully!",
      costs: {
        totalSOL: totalCostSOL,
        totalUSD: totalCostSOL * 165
      }
    });

  } catch (error) {
    console.error("❌ COMPLETE FAILURE:", error);
    return res.status(500).json({
      success: false,
      error: "NFT creation failed: " + error.message,
    });
  }
}
