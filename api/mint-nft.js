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

    console.log("🎨 === FIXED NFT CREATION ===");
    console.log("👤 Wallet:", walletAddress);

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      });
    }

    // Import Solana libraries
    const { Connection, PublicKey, Keypair, SystemProgram, Transaction } = await import("@solana/web3.js");
    const { 
      createMint, 
      getOrCreateAssociatedTokenAccount, 
      mintTo, 
      TOKEN_PROGRAM_ID,
      createAssociatedTokenAccountInstruction,
      getAssociatedTokenAddress
    } = await import("@solana/spl-token");
    const bs58 = (await import("bs58")).default;

    // Initialize connection
    const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

    // Parse private key
    let privateKeyArray;
    try {
      if (process.env.CREATOR_PRIVATE_KEY?.startsWith("[")) {
        privateKeyArray = JSON.parse(process.env.CREATOR_PRIVATE_KEY);
      } else if (process.env.CREATOR_PRIVATE_KEY) {
        const decoded = bs58.decode(process.env.CREATOR_PRIVATE_KEY);
        privateKeyArray = Array.from(decoded);
      } else {
        return res.status(500).json({
          success: false,
          error: "CREATOR_PRIVATE_KEY not configured"
        });
      }
    } catch (error) {
      console.error("❌ Private key parsing error:", error);
      return res.status(500).json({
        success: false,
        error: "Invalid CREATOR_PRIVATE_KEY format"
      });
    }

    // Create keypairs - USE FRESH KEYPAIR FOR MINT
    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    const mintKeypair = Keypair.generate(); // NEW MINT KEYPAIR
    
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString());
    console.log("🔑 New mint keypair generated:", mintKeypair.publicKey.toString());

    // Check balance
    const balance = await connection.getBalance(creatorKeypair.publicKey);
    console.log("💰 Creator wallet balance:", balance / 1e9, "SOL");

    if (balance < 0.01 * 1e9) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL in creator wallet. Balance: ${balance / 1e9} SOL.`
      });
    }

    // Create the mint account manually to avoid conflicts
    console.log("⚡ Creating NFT mint account...");
    
    const lamports = await connection.getMinimumBalanceForRentExemption(82); // Mint account size
    
    const transaction = new Transaction();
    
    // Create mint account
    transaction.add(
      SystemProgram.createAccount({
        fromPubkey: creatorKeypair.publicKey,
        newAccountPubkey: mintKeypair.publicKey,
        lamports,
        space: 82,
        programId: TOKEN_PROGRAM_ID,
      })
    );

    // Initialize mint
    const { createInitializeMintInstruction } = await import("@solana/spl-token");
    transaction.add(
      createInitializeMintInstruction(
        mintKeypair.publicKey,
        0, // 0 decimals for NFT
        creatorKeypair.publicKey,
        creatorKeypair.publicKey,
        TOKEN_PROGRAM_ID
      )
    );

    // Get recipient's associated token address
    const recipientPubkey = new PublicKey(walletAddress);
    const associatedTokenAddress = await getAssociatedTokenAddress(
      mintKeypair.publicKey,
      recipientPubkey
    );

    // Create associated token account for recipient
    transaction.add(
      createAssociatedTokenAccountInstruction(
        creatorKeypair.publicKey, // payer
        associatedTokenAddress,   // associated token account
        recipientPubkey,          // owner
        mintKeypair.publicKey     // mint
      )
    );

    // Mint 1 token to recipient
    const { createMintToInstruction } = await import("@solana/spl-token");
    transaction.add(
      createMintToInstruction(
        mintKeypair.publicKey,    // mint
        associatedTokenAddress,   // destination
        creatorKeypair.publicKey, // authority
        1                         // amount (1 for NFT)
      )
    );

    // Sign and send transaction
    const signature = await connection.sendTransaction(
      transaction, 
      [creatorKeypair, mintKeypair], // Both keypairs needed
      { skipPreflight: false }
    );

    // Wait for confirmation
    await connection.confirmTransaction(signature);

    console.log("🎉 === NFT MINTED SUCCESSFULLY! ===");
    console.log("🔗 Mint address:", mintKeypair.publicKey.toString());
    console.log("📝 Transaction signature:", signature);

    const explorerUrl = `https://explorer.solana.com/address/${mintKeypair.publicKey.toString()}`;

    return res.status(200).json({
      success: true,
      mintAddress: mintKeypair.publicKey.toString(),
      transactionSignature: signature,
      explorerUrl: explorerUrl,
      network: "mainnet-beta",
      method: "manual_spl_token_creation",
      message: "REAL NFT minted successfully on Solana mainnet!",
    });

  } catch (error) {
    console.error("❌ NFT Mint error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
