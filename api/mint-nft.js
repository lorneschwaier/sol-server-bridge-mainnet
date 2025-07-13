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

    console.log("🔥 === Minting NFT with Metadata ===");

    // Validate input
    if (!walletAddress || !metadata || !metadata.image || !metadata.name) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress, metadata.image, metadata.name"
      });
    }

    const { Connection, PublicKey, Keypair, Transaction, SystemProgram, SYSVAR_RENT_PUBKEY } = await import("@solana/web3.js");
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

    // Check wallet balance
    const balanceBefore = await connection.getBalance(creatorKeypair.publicKey);
    if (balanceBefore < 0.001 * 1e9) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL. Balance: ${balanceBefore / 1e9} SOL.`
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

    // Step 3: Create metadata account using the Metaplex function
    console.log("📝 Step 3: Creating metadata account...");

    try {
      const metaplexLib = await import("@metaplex-foundation/mpl-token-metadata");

      const METADATA_PROGRAM_ID = new PublicKey(metaplexLib.MPL_TOKEN_METADATA_PROGRAM_ID);
      console.log("✅ Using instruction data serializer approach");

      const [metadataAccount] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("metadata"),
          METADATA_PROGRAM_ID.toBuffer(),
          mint.toBuffer(),
        ],
        METADATA_PROGRAM_ID
      );

      console.log("📍 Metadata account PDA:", metadataAccount.toString());

      const metadataTransaction = new Transaction().add(
        metaplexLib.createCreateMetadataAccountV3Instruction(
          metadataAccount,
          mint,
          creatorKeypair.publicKey,
          creatorKeypair.publicKey,
          creatorKeypair.publicKey,
          metadataUri,
          "WP",
          0,
          [creatorKeypair.publicKey],
          null,
          null
        )
      );

      const metadataSignature = await connection.sendTransaction(metadataTransaction, [creatorKeypair]);
      await connection.confirmTransaction(metadataSignature);

      console.log("✅ Metadata account created! Signature:", metadataSignature);

    } catch (metaplexError) {
      console.error("❌ Metadata creation failed:", metaplexError.message);
      return res.status(500).json({
        success: false,
        error: "Metadata creation failed - NFT incomplete"
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

    console.log("🔥 === NFT Minted Successfully ===");
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
      message: "NFT successfully minted with full metadata!",
      costs: {
        totalSOL: totalCostSOL,
        totalUSD: totalCostSOL * 165
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
