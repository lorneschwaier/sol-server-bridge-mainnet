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

    console.log("🚀 === COMPLETE WORKING WORDPRESS + METAPLEX CORE NFT ===");

    if (!walletAddress || !metadata || !metadata.image || !metadata.name) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress, metadata.image, metadata.name"
      });
    }

    // Import Metaplex Core libraries (the NEW working way)
    const { create, mplCore } = await import('@metaplex-foundation/mpl-core');
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { 
      createSignerFromKeypair, 
      signerIdentity, 
      generateSigner, 
      createGenericFile,
      publicKey
    } = await import('@metaplex-foundation/umi');
    const { irysUploader } = await import('@metaplex-foundation/umi-uploader-irys');
    const bs58 = (await import("bs58")).default;
    const axios = (await import("axios")).default;

    // Setup Umi (Metaplex's new framework) - THIS FIXES ALL THE ERRORS
    const umi = createUmi("https://api.mainnet-beta.solana.com")
      .use(mplCore())
      .use(irysUploader());

    // Parse private key and setup signer (THIS IS WHAT WAS MISSING)
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

    // Step 1: Upload metadata to IPFS with COMPLETE data
    console.log("📤 Step 1: Uploading complete metadata to IPFS...");
    
    let metadataUri;
    try {
      const nftMetadata = {
        name: metadata.name,
        symbol: "XENO", // ADD SYMBOL FOR PROPER DISPLAY
        description: metadata.description || "Exclusive NFT from WordPress store purchase - unlock premium content and benefits",
        image: metadata.image,
        external_url: "https://x1xo.com", // YOUR WEBSITE
        attributes: [
          { trait_type: "Product ID", value: String(metadata.product_id || "unknown") },
          { trait_type: "Platform", value: "WordPress" },
          { trait_type: "Store", value: "XENO Store" },
          { trait_type: "Creator", value: "XENO" },
          { trait_type: "Purchase Date", value: new Date().toISOString().split('T')[0] },
          { trait_type: "Rarity", value: "Exclusive" },
          { trait_type: "Utility", value: "Content Access" }
        ],
        properties: {
          files: [{ 
            uri: metadata.image, 
            type: "image/png",
            cdn: true
          }],
          category: "image",
          creators: [{
            address: signer.publicKey,
            share: 100
          }]
        },
        collection: {
          name: "XENO WordPress Store NFTs",
          family: "XENO"
        }
      };

      console.log("📋 Complete NFT Metadata:", nftMetadata);

      const pinataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          pinataContent: nftMetadata,
          pinataMetadata: { 
            name: `xeno-wordpress-nft-${metadata.product_id || Date.now()}.json`,
            keyvalues: {
              "platform": "wordpress",
              "store": "xeno",
              "product": String(metadata.product_id || "unknown")
            }
          }
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
      console.log("✅ Complete metadata uploaded to IPFS:", metadataUri);

    } catch (ipfsError) {
      console.error("❌ IPFS upload failed:", ipfsError.message);
      return res.status(500).json({
        success: false,
        error: "Metadata upload failed - transaction cancelled"
      });
    }

    // Step 2: Create NFT with Metaplex Core (THE WORKING SOLUTION)
    console.log("🎨 Step 2: Creating complete NFT with Metaplex Core...");
    
    try {
      const asset = generateSigner(umi);
      
      console.log("🔍 Creating NFT with these details:");
      console.log("   - Asset address:", asset.publicKey);
      console.log("   - Owner:", walletAddress);
      console.log("   - Name:", metadata.name);
      console.log("   - URI:", metadataUri);
      
      const result = await create(umi, {
        asset,
        name: metadata.name,
        uri: metadataUri,
        owner: publicKey(walletAddress), // Convert to Umi publicKey format
        plugins: [
          {
            type: 'Attributes',
            attributeList: [
              { key: 'Platform', value: 'WordPress' },
              { key: 'Store', value: 'XENO' },
              { key: 'Product ID', value: String(metadata.product_id || 'unknown') },
              { key: 'Purchase Date', value: new Date().toISOString().split('T')[0] },
              { key: 'Symbol', value: 'XENO' },
              { key: 'Type', value: 'Store Purchase NFT' }
            ]
          }
        ]
      }).sendAndConfirm(umi);

      console.log("🎉 === NFT CREATED SUCCESSFULLY WITH FULL METADATA ===");
      console.log("🔗 Asset address:", asset.publicKey);
      console.log("📝 Transaction signature:", result.signature);
      console.log("🌐 Metadata URI:", metadataUri);
      console.log("👤 Owner:", walletAddress);
      console.log("🎯 Type: Metaplex Core NFT");

      // Return comprehensive response
      return res.status(200).json({
        success: true,
        mintAddress: asset.publicKey,
        assetAddress: asset.publicKey, // Core NFTs use asset address
        transactionSignature: result.signature,
        metadataUri: metadataUri,
        owner: walletAddress,
        name: metadata.name,
        symbol: "XENO",
        explorerUrl: `https://explorer.solana.com/address/${asset.publicKey}`,
        magicEdenUrl: `https://magiceden.io/item-details/${asset.publicKey}`,
        solscanUrl: `https://solscan.io/token/${asset.publicKey}`,
        message: "COMPLETE NFT with full metadata, symbol, and attributes created successfully using Metaplex Core!",
        type: "metaplex-core",
        metadata: {
          name: metadata.name,
          symbol: "XENO",
          description: metadata.description || "Exclusive NFT from WordPress store purchase",
          image: metadata.image,
          attributes: [
            { trait_type: "Platform", value: "WordPress" },
            { trait_type: "Store", value: "XENO" },
            { trait_type: "Product ID", value: String(metadata.product_id || "unknown") }
          ]
        }
      });

    } catch (coreError) {
      console.error("❌ Metaplex Core creation failed:", coreError.message);
      console.error("❌ Full error:", coreError);
      return res.status(500).json({
        success: false,
        error: "NFT creation failed: " + coreError.message,
        details: coreError.toString()
      });
    }

  } catch (error) {
    console.error("❌ COMPLETE SYSTEM FAILURE:", error);
    return res.status(500).json({
      success: false,
      error: "Complete system failure: " + error.message,
      stack: error.stack
    });
  }
}
