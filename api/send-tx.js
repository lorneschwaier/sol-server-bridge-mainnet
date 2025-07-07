import { Connection, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL;
const CREATOR_WALLET = process.env.CREATOR_WALLET; // Your destination wallet address

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { walletAddress, amount, productId } = req.body;

    if (!walletAddress || !amount || !productId) {
      return res.status(400).json({ success: false, error: "Missing required parameters" });
    }

    const connection = new Connection(RPC_URL, "confirmed");
    const fromPubkey = new PublicKey(walletAddress);
    const toPubkey = new PublicKey(CREATOR_WALLET);

    // Create transaction
    const blockhash = await connection.getLatestBlockhash();
    const tx = new Transaction({
      recentBlockhash: blockhash.blockhash,
      feePayer: fromPubkey,
    }).add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: Math.round(amount * 1e9), // convert SOL to lamports
      })
    );

    // Serialize to base64 for frontend signing
    const serialized = tx.serialize({
      requireAllSignatures: false, // so Phantom can sign it
      verifySignatures: false,
    });

    const base64Tx = serialized.toString("base64");

    return res.status(200).json({
      success: true,
      transaction: base64Tx,
      message: "🔗 Transaction created successfully",
    });
  } catch (err) {
    console.error("❌ Transaction creation error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
