export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { walletAddress, metadata } = req.body;

    console.log("🎨 === WEB3.JS 2.0 NFT MINTING ===");
    console.log("👤 Wallet:", walletAddress);

    if (!walletAddress || !metadata) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress and metadata",
      });
    }

    // Check environment variables
    if (!process.env.CREATOR_PRIVATE_KEY) {
      return res.status(500).json({
        success: false,
        error: "CREATOR_PRIVATE_KEY not configured",
      });
    }

    // Import Web3.js 2.0 - NO BUFFER ISSUES!
    const { createSolanaRpc, mainnet, address, createKeyPairFromBytes } = await import("@solana/web3.js");
    const { createUmi } = await import("@metaplex-foundation/umi-bundle-defaults");
    const { createV1, mplCore } = await import("@metaplex-foundation/mpl-core");
    const { keypairIdentity, generateSigner } = await import("@metaplex-foundation/umi");
    const bs58 = (await import("bs58")).default;

    // Create RPC connection with Web3.js 2.0
    const rpc = createSolanaRpc(mainnet('https://api.mainnet-beta.solana.com'));

    // Parse private key (Web3.js 2.0 way)
    let privateKeyArray;
    try {
      if (process.env.CREATOR_PRIVATE_KEY.startsWith("[")) {
        privateKeyArray = JSON.parse(process.env.CREATOR_PRIVATE_KEY);
      } else {
        const decoded = bs58.decode(process.env.CREATOR_PRIVATE_KEY);
        privateKeyArray = Array.from(decoded);
      }
    } catch (error) {
      console.error("❌ Private key parsing error:", error);
      return res.status(500).json({
        success: false,
        error: "Invalid CREATOR_PRIVATE_KEY format"
      });
    }

    // Create keypair with Web3.js 2.0
    const creatorKeypair = await createKeyPairFromBytes(new Uint8Array(privateKeyArray));
    const creatorAddress = address(creatorKeypair.publicKey);
    
    console.log("✅ Creator wallet loaded:", creatorAddress);

    // Check balance
    const balance = await rpc.getBalance(creatorAddress).send();
    console.log("💰 Creator wallet balance:", Number(balance.value) / 1e9, "SOL");

    if (Number(balance.value) < 0.01 * 1e9) {
      return res.status(500).json({
        success: false,
        error: `Insufficient SOL in creator wallet. Balance: ${Number(balance.value) / 1e9} SOL.`
      });
    }

    // Initialize UMI with Metaplex Core
    const umi = createUmi('https://api.mainnet-beta.solana.com').use(mplCore());
    
    // Convert Web3.js 2.0 keypair to UMI format
    const umiKeypair = {
      publicKey: creatorKeypair.publicKey,
      secretKey: new Uint8Array(privateKeyArray)
    };
    
    const creatorUmi = umi.use(keypairIdentity(umiKeypair));

    // Generate asset signer
    const asset = generateSigner(creatorUmi);
    console.log("🔑 Generated asset address:", asset.publicKey);

    console.log("⚡ Creating REAL NFT with Web3.js 2.0 + Metaplex Core...");

    // Create the NFT using Metaplex Core
    const createInstruction = createV1(creatorUmi, {
      asset,
      name: metadata.name || "Unnamed NFT",
      uri: `data:application/json;base64,${btoa(JSON.stringify(metadata))}`,
    });

    // Execute the transaction
    console.log("📡 Submitting REAL NFT transaction to Solana mainnet...");
    const result = await createInstruction.sendAndConfirm(creatorUmi);

    console.log("🎉 === REAL NFT MINTED SUCCESSFULLY WITH WEB3.JS 2.0! ===");
    console.log("🔗 Asset address:", asset.publicKey);
    console.log("📝 Transaction signature:", result.signature);

    const explorerUrl = `https://explorer.solana.com/address/${asset.publicKey}`;

    return res.status(200).json({
      success: true,
      mintAddress: asset.publicKey,
      transactionSignature: result.signature,
      explorerUrl: explorerUrl,
      network: "mainnet-beta",
      method: "web3js_2.0_metaplex_core",
      message: "REAL NFT minted successfully with Web3.js 2.0 on Solana mainnet!",
    });

  } catch (error) {
    console.error("❌ Web3.js 2.0 NFT Mint error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
