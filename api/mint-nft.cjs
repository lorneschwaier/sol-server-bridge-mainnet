const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  clusterApiUrl,
} = require("@solana/web3.js");
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
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
const bs58 = require("bs58");
const axios = require("axios");
const FormData = require("form-data");

const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta";
const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY;
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

const connection = new Connection(SOLANA_RPC_URL, "confirmed");

let umi = null;
let signer = null;

function initUmi() {
  if (!CREATOR_PRIVATE_KEY) throw new Error("Missing CREATOR_PRIVATE_KEY");

  const privateKeyArray = CREATOR_PRIVATE_KEY.startsWith("[")
    ? JSON.parse(CREATOR_PRIVATE_KEY)
    : Array.from(bs58.decode(CREATOR_PRIVATE_KEY));

  umi = createUmi(SOLANA_RPC_URL).use(mplTokenMetadata());
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(
    new Uint8Array(privateKeyArray)
  );
  signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(signerIdentity(signer));
}

async function uploadImageToPinata(imageUrl) {
  const ext = imageUrl.split(".").pop().split("?")[0];
  const fileName = `nft-image-${Date.now()}.${ext}`;
  const response = await axios.get(imageUrl, { responseType: "stream" });

  const form = new FormData();
  form.append("file", response.data, {
    filename: fileName,
    contentType: response.headers["content-type"] || "image/png",
  });

  form.append("pinataMetadata", JSON.stringify({ name: fileName }));

  const res = await axios.post(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    form,
    {
      headers: {
        ...form.getHeaders(),
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    }
  );

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
    if (!walletAddress || !metadata) throw new Error("Missing params");

    initUmi();

    const creatorBalance = await connection.getBalance(signer.publicKey);
    if (creatorBalance < 0.005 * LAMPORTS_PER_SOL) {
      throw new Error("Creator wallet has insufficient SOL");
    }

    const imageUrl = metadata.image.startsWith("http")
      ? await uploadImageToPinata(metadata.image)
      : metadata.image;

    const fullMetadata = {
      name: metadata.name || "Unnamed NFT",
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
    const tx = await createNft(umi, {
      mint,
      name: fullMetadata.name,
      symbol: fullMetadata.symbol,
      uri,
      sellerFeeBasisPoints: fullMetadata.seller_fee_basis_points,
      creators: [{ address: signer.publicKey, verified: true, share: 100 }],
      tokenOwner: publicKey(walletAddress),
      isMutable: true,
      updateAuthority: signer,
      mintAuthority: signer,
      payer: signer,
    }).sendAndConfirm(umi);

    return res.status(200).json({
      success: true,
      mintAddress: mint.publicKey.toString(),
      signature: tx.signature,
      explorer: `https://explorer.solana.com/address/${mint.publicKey.toString()}?cluster=${SOLANA_NETWORK}`,
    });
  } catch (e) {
    console.error("❌ Minting failed:", e);
    return res.status(500).json({ success: false, error: e.message || "Unknown error" });
  }
};
