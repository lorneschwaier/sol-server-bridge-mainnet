const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
  PublicKey
} = require("@solana/web3.js");

const {
  createUmi,
  generateSigner,
  signerIdentity,
  publicKey,
  createSignerFromKeypair
} = require("@metaplex-foundation/umi");

const { mplTokenMetadata, createNft } = require("@metaplex-foundation/mpl-token-metadata");
const bs58 = require("bs58");
const axios = require("axios");
const FormData = require("form-data");

const RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY;
const COLLECTION_MINT_ADDRESS = process.env.COLLECTION_MINT_ADDRESS;
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

const connection = new Connection(RPC_URL, "confirmed");

let umi = null;
let signer = null;

function initUmi() {
  const secretArray = CREATOR_PRIVATE_KEY.startsWith("[")
    ? JSON.parse(CREATOR_PRIVATE_KEY)
    : Array.from(bs58.decode(CREATOR_PRIVATE_KEY));

  umi = createUmi(RPC_URL).use(mplTokenMetadata());

  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(secretArray));
  signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(signerIdentity(signer));

  console.log("✅ UMI signer ready:", signer.publicKey.toString());
}

initUmi();

async function uploadImage(imageUrl) {
  const response = await axios.get(imageUrl, { responseType: "stream" });
  const ext = imageUrl.split(".").pop().split("?")[0];
  const fileName = `nft-image-${Date.now()}.${ext}`;
  const form = new FormData();

  form.append("file", response.data, {
    filename: fileName,
    contentType: response.headers["content-type"] || "image/png"
  });

  form.append("pinataMetadata", JSON.stringify({ name: fileName }));

  const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", form, {
    headers: {
      ...form.getHeaders(),
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY
    }
  });

  return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`;
}

async function uploadMetadata(metadata) {
  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
    {
      pinataContent: metadata,
      pinataMetadata: { name: `nft-metadata-${Date.now()}.json` }
    },
    {
      headers: {
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY
      }
    }
  );
  return `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { walletAddress, metadata } = req.body;

    if (!walletAddress || !metadata) {
      return res.status(400).json({ success: false, error: "Missing walletAddress or metadata" });
    }

    const creatorBalance = await connection.getBalance(signer.publicKey);
    if (creatorBalance < 0.005 * LAMPORTS_PER_SOL) {
      return res.status(400).json({ success: false, error: "Insufficient SOL in mint wallet" });
    }

    const imageUrl = metadata.image.startsWith("http")
      ? await uploadImage(metadata.image)
      : metadata.image;

    const fullMetadata = {
      name: metadata.name || "Untitled",
      symbol: metadata.symbol || "NFT",
      image: imageUrl,
      seller_fee_basis_points: (metadata.royalty || 0) * 100,
      properties: {
        creators: [
          {
            address: signer.publicKey.toString(),
            share: 100
          }
        ]
      }
    };

    const uri = await uploadMetadata(fullMetadata);
    const mint = generateSigner(umi);
    const owner = publicKey(walletAddress);
    const collection = COLLECTION_MINT_ADDRESS ? publicKey(COLLECTION_MINT_ADDRESS) : null;

    const tx = await createNft(umi, {
      mint,
      name: fullMetadata.name,
      symbol: fullMetadata.symbol,
      uri,
      sellerFeeBasisPoints: fullMetadata.seller_fee_basis_points,
      creators: [
        {
          address: signer.publicKey,
          verified: true,
          share: 100
        }
      ],
      tokenOwner: owner,
      collection: collection ? { key: collection, verified: true } : undefined,
      updateAuthority: signer,
      mintAuthority: signer,
      payer: signer,
      isMutable: true
    }).sendAndConfirm(umi);

    return res.status(200).json({
      success: true,
      mint_address: mint.publicKey.toString(),
      transaction_signature: tx.signature,
      explorer_url: `https://explorer.solana.com/address/${mint.publicKey.toString()}`,
      uri
    });
  } catch (e) {
    console.error("❌ NFT minting error:", e);
    res.status(500).json({
      success: false,
      error: e.message || "Internal error"
    });
  }
};
