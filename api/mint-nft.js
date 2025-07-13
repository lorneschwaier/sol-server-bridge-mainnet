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

    console.log("🎨 === NFT WITH COST TRACKING ===");
    console.log("👤 Recipient:", walletAddress);

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      });
    }

    // Import required libraries
    const { Connection, PublicKey, Keypair } = await import("@solana/web3.js");
    const { createMint, getOrCreateAssociatedTokenAccount, mintTo } = await import("@solana/spl-token");
    const bs58 = (await import("bs58")).default;

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

    // Create creator keypair
    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString());

    // COST TRACKING - Check balance before
    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);
    console.log("💰 Creator wallet balance BEFORE:", balanceBefore / 1e9, "SOL");

    if (balanceBefore < 0.01 * 1e9) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL in creator wallet. Balance: ${balanceBefore / 1e9} SOL.`
      });
    }

    // Create mint - this is where the main cost happens
    console.log("⚡ Creating NFT mint with cost tracking...");
    const mint = await createMint(
      connection,
      creatorKeypair,           // payer (this account pays fees)
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

    // COST TRACKING - Check balance after
    const balanceAfter = await connection.getBalance(creatorKeypair.publicKey);
    const totalCostSOL = (balanceBefore - balanceAfter) / 1e9;
    const totalCostUSD = totalCostSOL * 165; // Approximate SOL price

    console.log("💰 Creator wallet balance AFTER:", balanceAfter / 1e9, "SOL");
    console.log("💳 TOTAL NFT MINTING COST:", totalCostSOL, "SOL");
    console.log("💵 TOTAL NFT MINTING COST:", `~$${totalCostUSD.toFixed(4)} USD`);

    console.log("🎉 === NFT MINTED SUCCESSFULLY WITH COST TRACKING! ===");
    console.log("🔗 Mint address:", mint.toString());
    console.log("📝 Transaction signature:", mintResult);

    const explorerUrl = `https://explorer.solana.com/address/${mint.toString()}`;

    return res.status(200).json({
      success: true,
      mintAddress: mint.toString(),
      transactionSignature: mintResult,
      explorerUrl: explorerUrl,
      network: "mainnet-beta",
      method: "spl_token_with_cost_tracking",
      message: "REAL NFT minted successfully on Solana mainnet!",
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
