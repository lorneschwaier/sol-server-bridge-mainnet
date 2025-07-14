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

    console.log("🚀 === WORDPRESS + METAPLEX CORE NFT CREATION ===");

    if (!walletAddress || !metadata || !metadata.image || !metadata.name) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress, metadata.image, metadata.name"
      });
    }

    // Import Metaplex Core libraries (the NEW way)
    const { create, mplCore } = await import('@metaplex-foundation/mpl-core');
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { 
      createSignerFromKeypair, 
      signerIdentity, 
      generateSigner, 
      createGenericFile 
    } = await import('@metaplex-foundation/umi');
    const { irysUploader } = await import('@metaplex-foundation/umi-uploader-irys');
    const bs58 = (await import("bs58")).default;
    const axios = (await import("axios")).default;

    // Setup Umi (Metaplex's new framework)
    const umi = createUmi("https://api.mainnet-beta.solana.com")
      .use(mplCore())
      .use(irysUploader());

    // Parse private key and setup signer (THIS FIXES THE getPublicKey ERROR)
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

    const creatorKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(privateKeyArray));
    const signer = createSignerFromKeypair(umi, creatorKeypair);
    umi.use(signerIdentity(signer));

    console.log("✅ Creator wallet loaded:", signer.publicKey);

    // Step 1: Upload metadata to IPFS
    console.log("📤 Step 1: Uploading metadata to IPFS...");
    
    let metadataUri;
    try {
      const nftMetadata = {
        name: metadata.name,
        description: metadata.description || "NFT created from WordPress store purchase",
        image: metadata.image,
        attributes: [
          { trait_type: "Product ID", value: String(metadata.product_id || "unknown") },
          { trait_type: "Platform", value: "WordPress" },
          { trait_type: "Creator", value: "WordPress Store" },
          { trait_type: "Purchase Date", value: new Date().toISOString().split('T')[0] }
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

    // Step 2: Create NFT with Metaplex Core (MUCH SIMPLER!)
    console.log("🎨 Step 2: Creating NFT with Metaplex Core...");
    
    try {
      const asset = generateSigner(umi);
      
      const result = await create(umi, {
        asset,
        name: metadata.name,
        uri: metadataUri,
        owner: walletAddress, // Mint directly to customer
      }).sendAndConfirm(umi);

      console.log("🎉 === NFT CREATED SUCCESSFULLY ===");
      console.log("🔗 Asset address:", asset.publicKey);
      console.log("📝 Transaction signature:", result.signature);
      console.log("🌐 Metadata URI:", metadataUri);

      return res.status(200).json({
        success: true,
        mintAddress: asset.publicKey,
        transactionSignature: result.signature,
        metadataUri: metadataUri,
        explorerUrl: `https://explorer.solana.com/address/${asset.publicKey}`,
        magicEdenUrl: `https://magiceden.io/item-details/${asset.publicKey}`,
        message: "REAL NFT with full metadata created successfully using Metaplex Core!",
        type: "metaplex-core"
      });

    } catch (coreError) {
      console.error("❌ Metaplex Core creation failed:", coreError.message);
      return res.status(500).json({
        success: false,
        error: "NFT creation failed: " + coreError.message
      });
    }

  } catch (error) {
    console.error("❌ COMPLETE FAILURE:", error);
    return res.status(500).json({
      success: false,
      error: "NFT creation failed: " + error.message
    });
  }
}
