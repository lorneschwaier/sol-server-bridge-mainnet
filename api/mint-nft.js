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

    console.log("🎨 === SIMPLE NFT CREATION ===");
    console.log("👤 Wallet:", walletAddress);

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      });
    }

    // Import basic Solana libraries
    const { Connection, PublicKey, Keypair, clusterApiUrl } = await import("@solana/web3.js");
    const { createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } = await import("@solana/spl-token");
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

    // Create keypair
    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    console.log("✅ Creator wallet loaded:", creatorKeypair.publicKey.toString());

    // Check balance
    const balance = await connection.getBalance(creatorKeypair.publicKey);
    console.log("💰 Creator wallet balance:", balance / 1e9, "SOL");

    if (balance < 0.01 * 1e9) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL in creator wallet. Balance: ${balance / 1e9} SOL.`
      });
    }

    // Create mint (this acts as the NFT)
    console.log("⚡ Creating NFT mint...");
    const mint = await createMint(
      connection,
      creatorKeypair,
      creatorKeypair.publicKey,
      creatorKeypair.publicKey,
      0 // 0 decimals for NFT
    );

    console.log("🔑 NFT mint created:", mint.toString());

    // Get or create token account for the recipient
    const recipientPubkey = new PublicKey(walletAddress);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      creatorKeypair,
      mint,
      recipientPubkey
    );

    // Mint 1 token to the recipient (making it an NFT)
    const mintResult = await mintTo(
      connection,
      creatorKeypair,
      mint,
      tokenAccount.address,
      creatorKeypair.publicKey,
      1 // Mint exactly 1 token
    );

    console.log("🎉 === NFT MINTED SUCCESSFULLY! ===");
    console.log("🔗 Mint address:", mint.toString());
    console.log("📝 Transaction signature:", mintResult);

    const explorerUrl = `https://explorer.solana.com/address/${mint.toString()}`;

    return res.status(200).json({
      success: true,
      mintAddress: mint.toString(),
      transactionSignature: mintResult,
      explorerUrl: explorerUrl,
      network: "mainnet-beta",
      method: "spl_token_mint",
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
