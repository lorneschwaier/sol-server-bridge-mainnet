export default async function handler(req, res) {
  // Fix Buffer issues in serverless environment
  if (typeof global.Buffer === "undefined") {
    global.Buffer = require("buffer").Buffer;
  }

  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { walletAddress, metadata } = req.body;
    const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = await import("@solana/web3.js");
    const { Metaplex } = await import("@metaplex-foundation/js");
    const axios = await import("axios");
    const bs58 = await import("bs58");

    if (!walletAddress || !metadata) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }
    if (!process.env.CREATOR_PRIVATE_KEY || !process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_KEY) {
      return res.status(500).json({ success: false, error: "Environment variables not configured" });
    }

    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta";
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || (SOLANA_NETWORK === "mainnet-beta" ? "https://<your-private-rpc-endpoint>" : clusterApiUrl(SOLANA_NETWORK));

    // Validate wallet address
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      return res.status(400).json({ success: false, error: "Invalid wallet address format" });
    }

    // Upload metadata to Pinata
    console.log("📤 Uploading metadata...");
    const pinataResponse = await axios.default.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      { pinataContent: metadata, pinataMetadata: { name: `nft-metadata-${Date.now()}.json` } },
      { headers: { pinata_api_key: process.env.PINATA_API_KEY, pinata_secret_api_key: process.env.PINATA_SECRET_KEY }, timeout: 30000 }
    );
    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${pinataResponse.data.IpfsHash}`;
    console.log("✅ Metadata uploaded:", metadataUrl);

    // Initialize Solana connection
    const connection = new Connection(SOLANA_RPC_URL, "confirmed");

    // Parse private key
    const privateKeyArray = process.env.CREATOR_PRIVATE_KEY.startsWith("[")
      ? JSON.parse(process.env.CREATOR_PRIVATE_KEY)
      : Array.from(bs58.default.decode(process.env.CREATOR_PRIVATE_KEY));
    const creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    console.log("✅ Creator wallet:", creatorKeypair.publicKey.toString());

    // Check balance
    const balance = await connection.getBalance(creatorKeypair.publicKey);
    if (balance < 0.01 * LAMPORTS_PER_SOL) {
      throw new Error(`Insufficient SOL: ${balance / LAMPORTS_PER_SOL} SOL`);
    }

    // Mint NFT with Metaplex
    const metaplex = Metaplex.make(connection).use(keypairIdentity(creatorKeypair));
    const { nft } = await metaplex.nfts().create({
      uri: metadataUrl,
      name: metadata.name || "Unnamed NFT",
      sellerFeeBasisPoints: 500,
      owners: [new PublicKey(walletAddress)],
      collection: metadata.collection ? new PublicKey(metadata.collection) : undefined
    });

    console.log("🎉 NFT minted! Address:", nft.address.toString());
    res.status(200).json({
      success: true,
      mintAddress: nft.address.toString(),
      transactionSignature: nft.mintTransactionId,
      metadataUrl,
      explorerUrl: `https://explorer.solana.com/address/${nft.address}?cluster=${SOLANA_NETWORK}`,
      network: SOLANA_NETWORK,
      message: "NFT minted successfully!"
    });
  } catch (error) {
    console.error("❌ Mint NFT error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}
