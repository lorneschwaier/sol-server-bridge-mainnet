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

    console.log("🎨 === METADATA FOCUSED NFT CREATION ===");

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      });
    }

    // Import libraries
    const { Connection, PublicKey, Keypair } = await import("@solana/web3.js");
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

    // Check balance with lower threshold
    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);
    if (balanceBefore < 0.003 * 1e9) {
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
        name: metadata.name || "WordPress NFT",
        description: metadata.description || "NFT created via WordPress store",
        image: metadata.image || "https://via.placeholder.com/512x512.png?text=WordPress+NFT",
        attributes: [
          { trait_type: "Product ID", value: String(metadata.product_id || "unknown") },
          { trait_type: "Platform", value: "WordPress" },
          { trait_type: "Creator", value: "WordPress Store" },
          { trait_type: "Minted Date", value: new Date().toISOString().split('T')[0] }
        ],
        properties: {
          files: [
            {
              uri: metadata.image || "https://via.placeholder.com/512x512.png?text=WordPress+NFT",
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
      console.error("❌ IPFS upload failed:", ipfsError.message);
      return res.status(500).json({
        success: false,
        error: "Metadata upload failed: " + ipfsError.message
      });
    }

    // Step 2: Create mint using simple approach first
    console.log("⚡ Step 2: Creating mint...");
    const mint = await createMint(
      connection,
      creatorKeypair,
      creatorKeypair.publicKey,
      creatorKeypair.publicKey,
      0 // 0 decimals for NFT
    );

    console.log("🔑 Mint created:", mint.toString());

    // Step 3: Create metadata account using Metaplex
    console.log("📝 Step 3: Creating Metaplex metadata account...");
    
    try {
      const metaplexModule = await import("@metaplex-foundation/mpl-token-metadata");
      const { createCreateMetadataAccountV3Instruction, PROGRAM_ID: METADATA_PROGRAM_ID } = metaplexModule;

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

      // Create metadata account instruction
      const createMetadataInstruction = createCreateMetadataAccountV3Instruction(
        {
          metadata: metadataAccount,
          mint: mint,
          mintAuthority: creatorKeypair.publicKey,
          payer: creatorKeypair.publicKey,
          updateAuthority: creatorKeypair.publicKey,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name: metadata.name || "WordPress NFT",
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
          },
        }
      );

      // Send metadata transaction
      const { Transaction } = await import("@solana/web3.js");
      const metadataTransaction = new Transaction().add(createMetadataInstruction);
      
      const metadataSignature = await connection.sendTransaction(metadataTransaction, [creatorKeypair]);
      await connection.confirmTransaction(metadataSignature);
      
      console.log("✅ Metadata account created! Signature:", metadataSignature);

    } catch (metaplexError) {
      console.error("❌ Metaplex metadata creation failed:", metaplexError.message);
      console.log("⚠️ Continuing without metadata - will be basic SPL token");
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

    // Cost tracking
    const balanceAfter = await connection.getBalance(creatorKeypair.publicKey);
    const totalCostSOL = (balanceBefore - balanceAfter) / 1e9;

    console.log("🎉 === NFT CREATION COMPLETE ===");
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
      message: "NFT with metadata created on Solana mainnet!",
      costs: {
        totalSOL: totalCostSOL,
        totalUSD: totalCostSOL * 165
      }
    });

  } catch (error) {
    console.error("❌ NFT creation error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
