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

    console.log("🚀 === FINAL COMPLETE WORDPRESS NFT WITH WORKING IMAGES ===");

    if (!walletAddress || !metadata || !metadata.image || !metadata.name) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: walletAddress, metadata.image, metadata.name"
      });
    }

    // Import Metaplex Core libraries
    const { create, mplCore } = await import('@metaplex-foundation/mpl-core');
    const { createUmi } = await import('@metaplex-foundation/umi-bundle-defaults');
    const { 
      createSignerFromKeypair, 
      signerIdentity, 
      generateSigner,
      publicKey
    } = await import('@metaplex-foundation/umi');
    const { irysUploader } = await import('@metaplex-foundation/umi-uploader-irys');
    const bs58 = (await import("bs58")).default;
    const axios = (await import("axios")).default;

    // Setup Umi framework
    const umi = createUmi("https://api.mainnet-beta.solana.com")
      .use(mplCore())
      .use(irysUploader());

    // Setup creator signer
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

    // Step 1: Upload IMAGE to IPFS first
    console.log("📸 Step 1: Uploading image to IPFS...");
    
    let imageUri;
    try {
      // Download image from your WordPress server
      const imageResponse = await axios.get(metadata.image, { 
        responseType: 'arraybuffer',
        timeout: 30000 
      });
      const imageBuffer = Buffer.from(imageResponse.data);
      
      console.log("📥 Downloaded image, size:", imageBuffer.length, "bytes");

      // Create form data for Pinata file upload
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('file', imageBuffer, {
        filename: `nft-${metadata.product_id || Date.now()}.png`,
        contentType: 'image/png'
      });
      
      formData.append('pinataMetadata', JSON.stringify({
        name: `XENO NFT Image #${metadata.product_id || Date.now()}`,
        keyvalues: {
          "type": "nft-image",
          "product": String(metadata.product_id || "unknown")
        }
      }));

      // Upload to Pinata
      const imageUploadResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            pinata_api_key: process.env.PINATA_API_KEY,
            pinata_secret_api_key: process.env.PINATA_SECRET_KEY
          },
          timeout: 60000
        }
      );

      imageUri = `https://gateway.pinata.cloud/ipfs/${imageUploadResponse.data.IpfsHash}`;
      console.log("✅ Image uploaded to IPFS:", imageUri);

    } catch (imageError) {
      console.log("⚠️ Image upload failed, using original URL:", imageError.message);
      imageUri = metadata.image; // Fallback to original URL
    }

    // Step 2: Create complete metadata with IPFS image
    console.log("📋 Step 2: Creating complete metadata...");
    
    let metadataUri;
    try {
      const nftMetadata = {
        name: metadata.name,
        symbol: "XENO",
        description: metadata.description || "Exclusive NFT from XENO WordPress store - unlocks premium content and benefits",
        image: imageUri, // Use IPFS-hosted image
        external_url: "https://x1xo.com",
        animation_url: null,
        attributes: [
          { trait_type: "Product ID", value: String(metadata.product_id || "unknown") },
          { trait_type: "Platform", value: "WordPress" },
          { trait_type: "Store", value: "XENO Store" },
          { trait_type: "Creator", value: "XENO" },
          { trait_type: "Purchase Date", value: new Date().toISOString().split('T')[0] },
          { trait_type: "Rarity", value: "Exclusive" },
          { trait_type: "Utility", value: "Content Access" },
          { trait_type: "Type", value: "Store Purchase NFT" }
        ],
        properties: {
          files: [{ 
            uri: imageUri, 
            type: "image/png",
            cdn: false
          }],
          category: "image",
          creators: [{
            address: signer.publicKey,
            verified: true,
            share: 100
          }]
        },
        collection: {
          name: "XENO WordPress Store NFTs",
          family: "XENO"
        }
      };

      console.log("📝 Complete metadata created:", nftMetadata.name);

      // Upload metadata to IPFS
      const metadataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        {
          pinataContent: nftMetadata,
          pinataMetadata: { 
            name: `xeno-nft-metadata-${metadata.product_id || Date.now()}.json`,
            keyvalues: {
              "platform": "wordpress",
              "store": "xeno",
              "product": String(metadata.product_id || "unknown"),
              "type": "nft-metadata"
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

      metadataUri = `https://gateway.pinata.cloud/ipfs/${metadataResponse.data.IpfsHash}`;
      console.log("✅ Complete metadata uploaded to IPFS:", metadataUri);

    } catch (metadataError) {
      console.error("❌ Metadata upload failed:", metadataError.message);
      return res.status(500).json({
        success: false,
        error: "Metadata upload failed - transaction cancelled"
      });
    }

    // Step 3: Create NFT with Metaplex Core
    console.log("🎨 Step 3: Creating NFT with Metaplex Core...");
    
    try {
      const asset = generateSigner(umi);
      
      console.log("🔍 Creating NFT:");
      console.log("   - Asset address:", asset.publicKey);
      console.log("   - Owner:", walletAddress);
      console.log("   - Name:", metadata.name);
      console.log("   - Image URI:", imageUri);
      console.log("   - Metadata URI:", metadataUri);
      
      const result = await create(umi, {
        asset,
        name: metadata.name,
        uri: metadataUri,
        owner: publicKey(walletAddress),
        plugins: [
          {
            type: 'Attributes',
            attributeList: [
              { key: 'Platform', value: 'WordPress' },
              { key: 'Store', value: 'XENO' },
              { key: 'Product ID', value: String(metadata.product_id || 'unknown') },
              { key: 'Purchase Date', value: new Date().toISOString().split('T')[0] },
              { key: 'Symbol', value: 'XENO' },
              { key: 'Type', value: 'Store Purchase NFT' },
              { key: 'Utility', value: 'Content Access' }
            ]
          }
        ]
      }).sendAndConfirm(umi);

      console.log("🎉 === NFT CREATED SUCCESSFULLY WITH WORKING IMAGES ===");
      console.log("🔗 Asset address:", asset.publicKey);
      console.log("📝 Transaction signature:", result.signature);
      console.log("🖼️ Image URI:", imageUri);
      console.log("📋 Metadata URI:", metadataUri);
      console.log("👤 Owner:", walletAddress);

      return res.status(200).json({
        success: true,
        mintAddress: asset.publicKey,
        assetAddress: asset.publicKey,
        transactionSignature: result.signature,
        metadataUri: metadataUri,
        imageUri: imageUri,
        owner: walletAddress,
        name: metadata.name,
        symbol: "XENO",
        explorerUrl: `https://explorer.solana.com/address/${asset.publicKey}`,
        magicEdenUrl: `https://magiceden.io/item-details/${asset.publicKey}`,
        solscanUrl: `https://solscan.io/token/${asset.publicKey}`,
        message: "COMPLETE NFT with working images and full metadata created successfully!",
        type: "metaplex-core",
        metadata: {
          name: metadata.name,
          symbol: "XENO",
          description: metadata.description || "Exclusive NFT from XENO WordPress store",
          image: imageUri,
          external_url: "https://x1xo.com",
          attributes: [
            { trait_type: "Platform", value: "WordPress" },
            { trait_type: "Store", value: "XENO" },
            { trait_type: "Product ID", value: String(metadata.product_id || "unknown") },
            { trait_type: "Utility", value: "Content Access" }
          ]
        }
      });

    } catch (coreError) {
      console.error("❌ NFT creation failed:", coreError.message);
      return res.status(500).json({
        success: false,
        error: "NFT creation failed: " + coreError.message
      });
    }

  } catch (error) {
    console.error("❌ COMPLETE SYSTEM FAILURE:", error);
    return res.status(500).json({
      success: false,
      error: "System failure: " + error.message
    });
  }
}
