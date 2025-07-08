
const { Connection, PublicKey, Keypair, clusterApiUrl, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const { createNft, mplTokenMetadata } = require("@metaplex-foundation/mpl-token-metadata");
const { createSignerFromKeypair, signerIdentity, generateSigner, publicKey } = require("@metaplex-foundation/umi");
const bs58 = require("bs58");

require("dotenv").config();

const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta";
const CREATOR_PRIVATE_KEY = process.env.CREATOR_PRIVATE_KEY;

const connection = new Connection(clusterApiUrl(SOLANA_NETWORK), "confirmed");
const umi = createUmi(clusterApiUrl(SOLANA_NETWORK));
umi.use(mplTokenMetadata());

async function createNFT(walletAddress, metadata, uri) {
  const mint = generateSigner(umi);
  const owner = publicKey(walletAddress);

  const privateKeyArray = CREATOR_PRIVATE_KEY.startsWith("[")
    ? JSON.parse(CREATOR_PRIVATE_KEY)
    : Array.from(bs58.decode(CREATOR_PRIVATE_KEY));

  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(privateKeyArray));
  const signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(signerIdentity(signer));

  const tx = await createNft(umi, {
    mint,
    name: metadata.name || "Unnamed NFT",
    symbol: metadata.symbol || "NFT",
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
    updateAuthority: signer,
    mintAuthority: signer,
    payer: signer,
    isMutable: true,
  }).sendAndConfirm(umi);

  return {
    mint: mint.publicKey.toString(),
    signature: tx.signature,
    explorer: `https://explorer.solana.com/address/${mint.publicKey.toString()}${SOLANA_NETWORK.includes("mainnet") ? "" : "?cluster=devnet"}`,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { walletAddress, metadata } = req.body;
    if (!walletAddress || !metadata || !metadata.image) {
      return res.status(400).json({ success: false, error: "Missing parameters" });
    }

    const uri = metadata.image;
    const privateKeyArray = CREATOR_PRIVATE_KEY.startsWith("[")
      ? JSON.parse(CREATOR_PRIVATE_KEY)
      : Array.from(bs58.decode(CREATOR_PRIVATE_KEY));

    const solanaKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
    const creatorBalance = await connection.getBalance(new PublicKey(solanaKeypair.publicKey.toString()));
    if (creatorBalance < 0.005 * LAMPORTS_PER_SOL) {
      return res.status(400).json({ success: false, error: "Insufficient balance to mint NFT" });
    }

    const mintResult = await createNFT(walletAddress, metadata, uri);

    return res.status(200).json({
      success: true,
      mint_address: mintResult.mint,
      transaction_signature: mintResult.signature,
      explorer_url: mintResult.explorer,
      network: SOLANA_NETWORK,
      message: "✅ NFT minted successfully!",
    });
  } catch (error) {
    console.error("❌ NFT minting error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
