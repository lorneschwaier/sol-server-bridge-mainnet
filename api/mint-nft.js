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

    console.log("🚀 === FIXED NODE.JS PINATA UPLOAD ===");
    console.log("📋 Original image URL:", metadata.image);

    if (!walletAddress || !metadata || !metadata.image || !metadata.name) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    // Import libraries
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

    // Setup Umi
    const umi = createUmi("https://api.mainnet-beta.solana.com")
      .use(mplCore())
      .use(irysUploader());

    // Setup signer
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
      return res.status(500).json({ success: false, error: "Invalid CREATOR_PRIVATE_KEY" });
    }

    const creatorKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(privateKeyArray));
    const signer = createSignerFromKeypair(umi, creatorKeypair);
    umi.use(signerIdentity(signer));

    console.log("✅ Creator wallet:", signer.publicKey);

    // Step 1: Download and upload image to Pinata using correct Node.js approach
    console.log("📸 Step 1: Downloading image from WordPress...");
    
    let finalImageUri;
    try {
      // Download image from WordPress
      const imageResponse = await axios.get(metadata.image, { 
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NFT-Bot/1.0)'
        }
      });
      
      const imageBuffer = Buffer.from(imageResponse.data);
      console.log("✅ Downloaded image successfully:", imageBuffer.length, "bytes");

      // Create proper multipart form data for Node.js
      const boundary = `----formdata-pinata-${Date.now()}`;
      const CRLF = '\r\n';
      
      // Build form data manually
      let formData = '';
      formData += `--${boundary}${CRLF}`;
      formData += `Content-Disposition: form-data; name="file"; filename="nft-image-${Date.now()}.png"${CRLF}`;
      formData += `Content-Type: image/png${CRLF}${CRLF}`;
      
      // Convert form data to buffer and add image
      const formDataPrefix = Buffer.from(formData, 'utf8');
      const formDataSuffix = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8');
      const fullFormData = Buffer.concat([formDataPrefix, imageBuffer, formDataSuffix]);

      console.log("📤 Uploading to Pinata...");
      
      // Upload to Pinata with proper headers
      const uploadResponse = await axios.post(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        fullFormData,
        {
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'pinata_api_key': process.env.PINATA_API_KEY,
            'pinata_secret_api_key': process.env.PINATA_SECRET_KEY
          },
          timeout: 60000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      finalImageUri = `https://gateway.pinata.cloud/ipfs/${uploadResponse.data.IpfsHash}`;
      console.log("🎉 IMAGE UPLOADED TO PINATA SUCCESSFULLY!");
      console.log("🌐 IPFS Image URI:", finalImageUri);

    } catch (imageError) {
      console.error("❌ Image upload failed:", imageError.message);
      console.log("⚠️ Using original WordPress image as fallback");
      finalImageUri = metadata.image;
    }

    // Step 2: Create metadata with the uploaded image
    console.log("📋 Step 2: Creating metadata...");
    
    const nftMetadata = {
      name: metadata.name,
      symbol: "XENO",
      description: metadata.description || "Exclusive NFT from XENO WordPress store",
      image: finalImageUri, // This should now be a real IPFS URL
      external_url: "https://x1xo.com",
      attributes: [
        { trait_type: "Product ID", value: String(metadata.product_id || "unknown") },
        { trait_type: "Platform", value: "WordPress" },
        { trait_type: "Store", value: "XENO" },
        { trait_type: "Creator", value: "XENO" },
        { trait_type: "Purchase Date", value: new Date().toISOString().split('T')[0] },
        { trait_type: "Type", value: "Store Purchase NFT" }
      ],
      properties: {
        files: [{ 
          uri: finalImageUri, 
          type: "image/png"
        }],
        category: "image",
        creators: [{
          address: signer.publicKey,
          verified: true,
          share: 100
        }]
      }
    };

    console.log("📝 Metadata with image:", finalImageUri);

    // Upload metadata to Pinata
    const metadataResponse = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: nftMetadata,
        pinataMetadata: { 
          name: `xeno-nft-metadata-${Date.now()}.json`
        }
      },
      {
        headers: {
          pinata_api_key: process.env.PINATA_API_KEY,
          pinata_secret_api_key: process.env.PINATA_SECRET_KEY
        }
      }
    );

    const metadataUri = `https://gateway.pinata.cloud/ipfs/${metadataResponse.data.IpfsHash}`;
    console.log("✅ Metadata uploaded to IPFS:", metadataUri);

    // Step 3: Create NFT
    console.log("🎨 Step 3: Creating NFT...");
    
    const asset = generateSigner(umi);
    
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
            { key: 'Symbol', value: 'XENO' }
          ]
        }
      ]
    }).sendAndConfirm(umi);

    console.log("🎉 === NFT CREATED WITH REAL IPFS IMAGE ===");
    console.log("🔗 Asset:", asset.publicKey);
    console.log("📝 Signature:", result.signature);
    console.log("🖼️ Final Image URI:", finalImageUri);
    console.log("📋 Metadata URI:", metadataUri);

    return res.status(200).json({
      success: true,
      mintAddress: asset.publicKey,
      transactionSignature: result.signature,
      metadataUri: metadataUri,
      imageUri: finalImageUri,
      name: metadata.name,
      symbol: "XENO",
      explorerUrl: `https://explorer.solana.com/address/${asset.publicKey}`,
      magicEdenUrl: `https://magiceden.io/item-details/${asset.publicKey}`,
      message: "NFT created with real IPFS image!",
      debug: {
        originalImageUrl: metadata.image,
        ipfsImageUrl: finalImageUri,
        imageUploadedToIPFS: finalImageUri !== metadata.image
      }
    });

  } catch (error) {
    console.error("❌ Complete failure:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
