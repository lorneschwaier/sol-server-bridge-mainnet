import { Connection, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { create, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';

const connection = new Connection(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com', 'confirmed');

export async function handler(req, res) {
  try {
    // Step 1: Parse request body (Product ID and Wallet Address)
    const { wallet, productId } = req.body;

    if (!wallet || !productId) {
      return res.status(400).json({ success: false, error: 'Missing wallet or product ID' });
    }

    const mintAddress = publicKey('your_mint_address_here'); // Replace with actual mint address
    const metadataURI = 'https://example.com/metadata.json'; // Replace with actual metadata URI
    const nftName = 'My NFT';
    const nftSymbol = 'X1XO';

    // Step 2: Initialize UMI with the wallet and keypair
    const umi = createUmi(process.env.SOLANA_RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com')
      .use(mplTokenMetadata());

    const payer = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(JSON.parse(process.env.CREATOR_PRIVATE_KEY)));
    umi.use(keypairIdentity(payer));

    // Step 3: Create NFT metadata and mint it
    await create(umi, {
      mint: mintAddress,
      authority: umi.identity,
      name: nftName,
      symbol: nftSymbol,
      uri: metadataURI,
      sellerFeeBasisPoints: 500, // 5% seller fee
    }).sendAndConfirm(umi);

    // Step 4: Transfer SOL to fund the account creation
    const transferTransaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey, // The payer wallet
        toPubkey: mintAddress, // Replace with your mint address
        lamports: 0.0062 * LAMPORTS_PER_SOL, // Amount in lamports
      })
    );

    // Step 5: Send the transaction
    const signature = await connection.sendTransaction(transferTransaction, [payer]);
    await connection.confirmTransaction(signature);

    // Return success
    return res.status(200).json({
      success: true,
      signature: signature,
      message: 'NFT minted and SOL transfer completed successfully!',
    });
  } catch (error) {
    console.error('Error during minting process:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'An error occurred during minting.',
    });
  }
}
