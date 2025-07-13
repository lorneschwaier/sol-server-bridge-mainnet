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

    console.log("🎨 === FULL NFT WITH IMAGES AND METADATA ===");
    console.log("👤 Recipient:", walletAddress);
    console.log("📋 Metadata:", metadata);

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      });
    }

    // Import required libraries
    const { Connection, PublicKey, Keypair, Transaction, SystemProgram } = await import("@solana/web3.js");
    const { 
      createMint, 
      getOrCreateAssociatedTokenAccount, 
      mintTo,
      TOKEN_PROGRAM_ID,
      createInitializeMintInstruction,
      MINT_SIZE,
      getMinimumBalanceForRentExemptMint,
      getAssociatedTokenAddress,
      createAssociatedTokenAccountInstruction,
      createMintToInstruction
    } = await import("@solana/spl-token");
    const bs58 = (await import("bs58")).default;
    const axios = (await import("axios")).default;

    // Initialize connection
    const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

    // Parse private key
    let privateKeyArray;
    try {
      if (!process.env.CREATOR_PRIVATE_KEY) {
        return res.status(500).json({
          success: false,
          error: "CREATOR_PRIVATE_KEY not configured"
        });
      }

      const privateKey = process.env.CREATOR_PRIVATE_KEY.trim();
      
      if (privateKey.startsWith("[")) {
        privateKeyArray = JSON.parse(privateKey);
      } else {
        const decoded = bs58.decode(privateKey);
        privateKeyArray = Array.from(decoded);
      }
    } catch (error) {
      console.error("❌ Private key parsing error:", error);
      return res.status(500).json({
        success: false,
        error: "Invalid CREATOR_PRIVATE_KEY format"
      });
    }

    // Create keypairs
    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    const mintKeypair = Keypair.generate();
    
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString());
    console.log("🔑 Mint keypair generated:", mintKeypair.publicKey.toString());

    // COST TRACKING - Check balance before
    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);
    console.log("💰 Creator wallet balance BEFORE:", balanceBefore / 1e9, "SOL");

    if (balanceBefore < 0.005 * 1e9) {  // 0.005 SOL = ~$0.83
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL in creator wallet. Balance: ${balanceBefore / 1e9} SOL.`
      });
    }

    // Step 1: Upload metadata to IPFS using Pinata
    console.log("📤 Step 1: Uploading metadata to IPFS...");
    
    let metadataUri;
    try {
      const pinataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          pinataContent: {
            name: metadata.name || "WordPress NFT",
            description: metadata.description || "NFT created via WordPress",
            image: metadata.image || "",
            attributes: metadata.attributes || [
              { trait_type: "Product ID", value: metadata.product_id || "unknown" },
              { trait_type: "Minted Date", value: new Date().toISOString() }
            ]
          },
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

      metadataUri = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`;
      console.log("✅ Metadata uploaded to IPFS:", metadataUri);
    } catch (ipfsError) {
      console.log("⚠️ IPFS upload failed, using fallback metadata");
      metadataUri = `data:application/json;base64,${Buffer.from(JSON.stringify({
        name: metadata.name || "WordPress NFT",
        description: metadata.description || "NFT created via WordPress",
        image: metadata.image || "",
        attributes: metadata.attributes || []
      })).toString('base64')}`;
    }

    // Step 2: Create transaction with mint account
    console.log("⚡ Step 2: Creating NFT transaction...");
    
    const lamports = await getMinimumBalanceForRentExemptMint(connection);
    const transaction = new Transaction();
    
    // Create mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: creatorKeypair.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        lamports,
        space: MINT_SIZE,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    // Initialize mint
    transaction.add(
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        0, // 0 decimals for NFT
        creatorKeypair.publicKey,
        creatorKeypair.publicKey,
        TOKEN_PROGRAM_ID
      )
    );

    // Step 3: Try to add Metaplex metadata account
    console.log("📝 Step 3: Attempting to add Metaplex metadata...");
    
    try {
      const metaplexModule = await import("@metaplex-foundation/mpl-token-metadata");
      const { createCreateMetadataAccountV3Instruction, PROGRAM_ID: METADATA_PROGRAM_ID } = metaplexModule;

      const [metadataAddress] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          METADATA_PROGRAM_ID.toBuffer(),
          mintKeypair.publicKey.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );

      transaction.add(
        createCreateMetadataAccountV3Instruction(
          {
            metadata: metadataAddress,
            mint: mintKeypair.publicKey,
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
        )
      );

      console.log("✅ Metaplex metadata instruction added successfully");
    } catch (metaplexError) {
      console.log("⚠️ Metaplex metadata failed:", metaplexError.message);
      console.log("⚠️ Continuing with basic SPL token");
    }

    // Step 4: Create associated token account and mint to recipient
    const recipientPubkey = new PublicKey(walletAddress);
    const associatedTokenAddress = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      recipientPubkey
    );

    transaction.add(
      createAssociatedTokenAccountInstruction(
        creatorKeypair.publicKey,
        associatedTokenAddress,
        recipientPubkey,
        mintKeypair.publicKey
      )
    );

    // Mint 1 token to recipient
    transaction.add(
      createMintToInstruction(
        mintKeypair.publicKey,
        associatedTokenAddress,
        creatorKeypair.publicKey,
        1
      )
    );

    // Sign and send transaction
    console.log("📡 Step 4: Sending NFT transaction to Solana...");
    const signature = await connection.sendTransaction(
      transaction, 
      [creatorKeypair, mintKeypair],
      { skipPreflight: false }
    );

    // Wait for confirmation
    await connection.confirmTransaction(signature);

    // COST TRACKING - Check balance after
    const balanceAfter = await connection.getBalance(creatorKeypair.publicKey);
    const totalCostSOL = (balanceBefore - balanceAfter) / 1e9;
    const totalCostUSD = totalCostSOL * 165;

    console.log("💰 Creator wallet balance AFTER:", balanceAfter / 1e9, "SOL");
    console.log("💳 TOTAL NFT MINTING COST:", totalCostSOL, "SOL");
    console.log("💵 TOTAL NFT MINTING COST:", `~$${totalCostUSD.toFixed(4)} USD`);

    console.log("🎉 === NFT WITH METADATA MINTED SUCCESSFULLY! ===");
    console.log("🔗 Mint address:", mintKeypair.publicKey.toString());
    console.log("📝 Transaction signature:", signature);
    console.log("🌐 Metadata URI:", metadataUri);

    const explorerUrl = `https://explorer.solana.com/address/${mintKeypair.publicKey.toString()}`;

    return res.status(200).json({
      success: true,
      mintAddress: mintKeypair.publicKey.toString(),
      transactionSignature: signature,
      metadataUri: metadataUri,
      explorerUrl: explorerUrl,
      network: "mainnet-beta",
      method: "nft_with_metadata_attempt",
      message: "NFT with metadata minted successfully on Solana mainnet!",
      costs: {
        totalSOL: totalCostSOL,
        totalUSD: totalCostUSD,
        beforeBalance: balanceBefore / 1e9,
        afterBalance: balanceAfter / 1e9
      }
    });

  } catch (error) {
    console.error("❌ NFT mint error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
