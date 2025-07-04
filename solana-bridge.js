const express = require("express");
const cors = require("cors");
const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const { createNft, mplTokenMetadata } = require("@metaplex-foundation/mpl-token-metadata");
const { createSignerFromKeypair, signerIdentity, generateSigner, publicKey } = require("@metaplex-foundation/umi");
const axios = require("axios");
const bs58 = require("bs58");
const FormData = require("form-data");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "devnet";
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl(SOLANA_NETWORK);
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY;

const connection = new Connection(SOLANA_RPC_URL, "confirmed");
let creatorKeypair = null;
let umi = null;

function initUmi() {
  if (!CREATOR_PRIVATE_KEY) return;

  try {
    const privateKeyArray = CREATOR_PRIVATE_KEY.startsWith("[")
      ? JSON.parse(CREATOR_PRIVATE_KEY)
      : Array.from(bs58.decode(CREATOR_PRIVATE_KEY));

    creatorKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    umi = createUmi(SOLANA_RPC_URL);
    const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(privateKeyArray));
    const signer = createSignerFromKeypair(umi, umiKeypair);

    umi.use(signerIdentity(signer));
    umi.use(mplTokenMetadata());
    console.log("✅ UMI ready for minting");
  } catch (e) {
    console.error("UMI init failed:", e.message);
  }
}

initUmi();

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

async function createNFT(walletAddress, metadata, uri) {
  const mint = generateSigner(umi);
  const owner = publicKey(walletAddress);

  const collectionKey = process.env.COLLECTION_MINT_ADDRESS ? publicKey(process.env.COLLECTION_MINT_ADDRESS) : null;

  const tx = await createNft(umi, {
    mint,
    name: metadata.name || "Unnamed",
    symbol: metadata.symbol || "NFT",
    uri,
    sellerFeeBasisPoints: (metadata.royalty || 0) * 100,
    creators: [
      {
        address: umi.identity.publicKey,
        verified: true,
        share: 100,
      },
    ],
    tokenOwner: owner,
    collection: collectionKey ? { key: collectionKey, verified: true } : undefined,
    isMutable: true,
  }).sendAndConfirm(umi);

  return {
    mint: mint.publicKey,
    signature: tx.signature,
    explorer: `https://explorer.solana.com/address/${mint.publicKey}$
      {SOLANA_NETWORK === "devnet" ? "?cluster=devnet" : ""}`,
  };
}

app.post("/mint-nft", async (req, res) => {
  try {
    const { walletAddress, metadata } = req.body;
    if (!walletAddress || !metadata) throw new Error("Missing walletAddress or metadata");

    const imageUrl = metadata.image.startsWith("http") ? await uploadImageToPinata(metadata.image) : metadata.image;
    const fullMetadata = { ...metadata, image: imageUrl };
    const uri = await uploadMetadataToPinata(fullMetadata);
    const nft = await createNFT(walletAddress, fullMetadata, uri);

    res.json({
      success: true,
      mintAddress: nft.mint,
      signature: nft.signature,
      explorer: nft.explorer,
      uri,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/health", async (_, res) => {
  res.json({
    status: "ok",
    creator: creatorKeypair?.publicKey.toString() || "missing",
    pinata: !!PINATA_API_KEY && !!PINATA_SECRET_KEY,
    umiReady: !!umi,
    network: SOLANA_NETWORK,
  });
});

app.post("/blockhash", async (req, res) => {
  try {
    const response = await connection.getLatestBlockhash("finalized");
    res.json({
      jsonrpc: "2.0",
      result: {
        value: {
          blockhash: response.blockhash,
          lastValidBlockHeight: response.lastValidBlockHeight,
        }
      },
      id: req.body.id || 1
    });
  } catch (error) {
    console.error("Blockhash fetch failed:", error);
    res.status(500).json({ error: error.message });
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
