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

    console.log("🎨 === CLEAN WALLET NFT CREATION ===");
    console.log("👤 Recipient:", walletAddress);

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      });
    }

    // Import Solana libraries
    const { Connection, PublicKey, Keypair } = await import("@solana/web3.js");
    const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = await import("@solana/spl-token");
    const bs58 = (await import("bs58")).default;

    // Initialize connection
    const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

    // Parse private key - HANDLE BOTH FORMATS
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
        // Array format: [123,148,225,...]
        privateKeyArray = JSON.parse(privateKey);
      } else {
        // Base58 format: 5YHrEfQ1563RyQE3TKzLoqYvqHiBGk8brEu5WkPAa6rsuobDLEtin9czkKgJbMpVhu2GV4J
        const decoded = bs58.decode(privateKey);
        privateKeyArray = Array.from(decoded);
      }
    } catch (error) {
      console.error("❌ Private key parsing error:", error);
      return res.status(500).json({
        success: false,
        error: "Invalid CREATOR_PRIVATE_KEY format. Use either [123,148,...] or base58 string"
      });
    }

    // Create creator keypair from clean wallet
    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    
    console.log("✅ Clean creator wallet loaded:", creatorKeypair.publicKey.toString());

    // Check balance
    const balance = await connection.getBalance(creatorKeypair.publicKey);
    console.log("💰 Creator wallet balance:", balance / 1e9, "SOL");

    if (balance < 0.01 * 1e9) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL in creator wallet. Balance: ${balance / 1e9} SOL. Please fund: ${creatorKeypair.publicKey.toString()}`
      });
    }

    // Create mint - should work with clean wallet
    console.log("⚡ Creating NFT mint with clean wallet...");
    const mint = await createMint(
      connection,
      creatorKeypair,           // payer (clean wallet)
      creatorKeypair.publicKey, // mint authority
      creatorKeypair.publicKey, // freeze authority
      0                         // 0 decimals for NFT
    );

    console.log("🔑 NFT mint created:", mint.toString());

    // Get or create token account for the recipient
    const recipientPubkey = new PublicKey(walletAddress);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      creatorKeypair,    // payer
      mint,              // mint
      recipientPubkey    // owner
    );

    // Mint 1 token to the recipient
    const mintResult = await mintTo(
      connection,
      creatorKeypair,           // payer
      mint,                     // mint
      tokenAccount.address,     // destination
      creatorKeypair.publicKey, // authority
      1                         // amount (1 for NFT)
    );

    console.log("🎉 === NFT MINTED SUCCESSFULLY WITH CLEAN WALLET! ===");
    console.log("🔗 Mint address:", mint.toString());
    console.log("📝 Transaction signature:", mintResult);

    const explorerUrl = `https://explorer.solana.com/address/${mint.toString()}`;

    return res.status(200).json({
      success: true,
      mintAddress: mint.toString(),
      transactionSignature: mintResult,
      explorerUrl: explorerUrl,
      network: "mainnet-beta",
      method: "clean_wallet_spl_token",
      message: "REAL NFT minted successfully with clean wallet on Solana mainnet!",
    });

  } catch (error) {
    console.error("❌ Clean wallet NFT mint error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
