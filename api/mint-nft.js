import pkg from '@metaplex-foundation/mpl-token-metadata';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { Connection, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Destructure the required functions from the module
const { create, mplTokenMetadata } = pkg;

// Initialize Solana connection
const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

export default async function handler(req, res) {
  try {
    // Validate request body
    const { wallet, productId } = req.body;

    if (!wallet || !productId) {
      return res.status(400).json({ success: false, error: 'Missing wallet or product ID' });
    }

    // Initialize UMI with wallet and keypair
    const umi = createUmi(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com')
      .use(mplTokenMetadata());

    // Create keypair from the private key (assuming the private key is in the environment)
    const payer = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(JSON.parse(process.env.CREATOR_PRIVATE_KEY)));
    umi.use(keypairIdentity(payer));

    const mintAddress = publicKey('your_mint_address_here'); // Replace with your mint address
    const metadataURI = 'https://example.com/metadata.json'; // Replace with your metadata URI
    const nftName = 'My NFT';
    const nftSymbol = 'X1XO';

    // Create the NFT using Metaplex
    const createTransaction = await create(umi, {
      mint: mintAddress,
      authority: umi.identity,
      name: nftName,
      symbol: nftSymbol,
      uri: metadataURI,
      sellerFeeBasisPoints: 500, // 5% seller fee
    }).sendAndConfirm(umi);

    // Transfer SOL to fund the mint account creation
    const transferTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey, // Payer wallet
        toPubkey: mintAddress, // Replace with your mint address
        lamports: 0.0062 * LAMPORTS_PER_SOL, // Transfer amount in lamports (0.0062 SOL)
      })
    );

    // Send the transfer transaction
    const signature = await connection.sendTransaction(transferTransaction, [payer]);
    await connection.confirmTransaction(signature);

    // Respond with success
    return res.status(200).json({
      success: true,
      signature: signature,
      message: 'NFT minted and SOL transfer completed successfully!',
    });
  } catch (error) {
    // Handle errors properly
    console.error('Error during minting process:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred during minting.',
    });
  }
}
