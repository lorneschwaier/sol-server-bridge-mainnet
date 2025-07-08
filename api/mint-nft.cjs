const {
  Connection,
  PublicKey,
  Keypair,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  createUmi,
} = require("@metaplex-foundation/umi-bundle-defaults");
const {
  createNft,
  mplTokenMetadata,
} = require("@metaplex-foundation/mpl-token-metadata");
const {
  createSignerFromKeypair,
  signerIdentity,
  generateSigner,
  publicKey,
} = require("@metaplex-foundation/umi");
const axios = require("axios");
const bs58 = require("bs58");
const FormData = require("form-data");

// ENV
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta";
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY;
const COLLECTION_MINT_ADDRESS = process.env.COLLECTION_MINT_ADDRESS || null;

// Initialize UMI and signer
const umi = createUmi(SOLANA_RPC_URL);
umi.use(mplTokenMetadata());

let signer = null;
try {
  const privateKeyArray = CREATOR_PRIVATE_KEY.startsWith("[")
    ? JSON.parse(CREATOR_PRIVATE_KEY)
    : Array.from(bs58.decode(CREATOR_PRIVATE_KEY));
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(privateKeyArray));
  signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(signerIdentity(signer));
  console.log("✅ UMI signer ready:", signer.publicKey.toString());
} catch (e) {
  console.error("❌ UMI signer init failed:", e.message);
}

async function uploadImageToPinata(imageUrl) {
  const imageResponse = await axios.get(imageUrl, { responseType: "stream" });
  const ext = imageUrl.split(".").pop().split("?")[0];
  const fileName = `nft-image-${Date.now()}.${ext}`;

  const form = new FormData();
  form.append("file", imageResponse.data, {
    filename: fileName,
    contentType: imageResponse.headers["content-type"] || "image/png",
  });

  form.append("pinataMetadata", JSON.stringify({ name: fileName }));

  const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
    headers: {
      ...form.getHeaders(),
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
  });

  return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`;
}

async function uploadMetadataToPinata(metadata) {
  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    {
      pinataContent: metadata,
      pinataMetadata: { name: `nft-metadata-${Date.now()}.json` },
    },
    {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    }
  );

  return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { walletAddress, metadata } = req.body;
    if (!walletAddress || !metadata) throw new Error("Missing walletAddress or metadata");

    const connection = new Connection(SOLANA_RPC_URL, "confirmed");
    const creatorBalance = await connection.getBalance(
      new PublicKey(signer.publicKey.toString())
    );
    if (creatorBalance < 0.005 * LAMPORTS_PER_SOL) {
      throw new Error("Bridge wallet has insufficient SOL to mint NFT");
    }

    const imageUrl = metadata.image?.startsWith("http")
      ? await uploadImageToPinata(metadata.image)
      : metadata.image;

    const fullMetadata = {
      name: metadata.name || "Unnamed",
      symbol: metadata.symbol || "NFT",
      image: imageUrl,
      seller_fee_basis_points: (metadata.royalty || 0) * 100,
      properties: {
        creators: [
          {
            address: signer.publicKey.toString(),
            share: 100,
          },
        ],
      },
    };

    const uri = await uploadMetadataToPinata(fullMetadata);

    const mint = generateSigner(umi);
    const owner = publicKey(walletAddress);
    const collectionKey = COLLECTION_MINT_ADDRESS ? publicKey(COLLECTION_MINT_ADDRESS) : null;

    const tx = await createNft(umi, {
      mint,
      name: fullMetadata.name,
      symbol: fullMetadata.symbol,
      uri,
      sellerFeeBasisPoints: (metadata.royalty || 0) * 100,
      creators: [
        {
          address: signer.publicKey,
          verified: true,
          share: 100,
        },
      ],
      tokenOwner: owner,
      collection: collectionKey ? { key: collectionKey, verified: true } : undefined,
      isMutable: true,
      updateAuthority: signer,
      mintAuthority: signer,
      payer: signer,
    }).sendAndConfirm(umi);

    res.status(200).json({
      success: true,
      mint_address: mint.publicKey,
      signature: tx.signature,
      explorer_url: `https://explorer.solana.com/address/${mint.publicKey}${SOLANA_NETWORK.includes("mainnet") ? "" : "?cluster=devnet"}`,
      uri,
    });
  } catch (error) {
    console.error("❌ NFT minting error:", error);
    const err = error.logs ? error.logs.join("\n") : error.message || "Unknown error";
    res.status(500).json({ success: false, error: err });
  }
};
