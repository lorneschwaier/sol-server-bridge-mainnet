// Updated to use YOUR existing UMI dependencies
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createNft, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata"
import { createSignerFromKeypair, signerIdentity, generateSigner } from "@metaplex-foundation/umi"

// Use Helius free endpoint - more reliable than Alchemy
const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=demo", "confirmed")

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const pathname = url.pathname

    if (pathname === "/health") {
      // Check if merchant wallet has SOL
      let walletBalance = 0
      let walletAddress = "Not configured"

      if (process.env.CREATOR_PRIVATE_KEY) {
        try {
          const privateKeyArray = JSON.parse(process.env.CREATOR_PRIVATE_KEY)
          const merchantKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))
          walletAddress = merchantKeypair.publicKey.toString()

          const balance = await connection.getBalance(merchantKeypair.publicKey)
          walletBalance = balance / LAMPORTS_PER_SOL
        } catch (error) {
          console.error("Error checking wallet balance:", error)
        }
      }

      return res.status(200).json({
        status: "🔥 READY FOR REAL NFTS",
        network: "mainnet-beta",
        mode: "PRODUCTION - REAL SOL TRANSACTIONS",
        merchantWallet: walletAddress,
        merchantBalance: `${walletBalance.toFixed(4)} SOL`,
        readyToMint: walletBalance > 0.01,
        warning: "⚠️ REAL MONEY WILL BE SPENT",
        timestamp: new Date().toISOString(),
      })
    }

    if (pathname === "/send-tx") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
      }

      console.log("💰 REAL TRANSACTION MODE - SPENDING ACTUAL SOL")
      const { walletAddress, amount } = req.body

      if (!walletAddress || !amount) {
        return res.status(400).json({
          success: false,
          error: "Missing walletAddress or amount",
        })
      }

      // Verify we have private key
      if (!process.env.CREATOR_PRIVATE_KEY) {
        throw new Error("CREATOR_PRIVATE_KEY not configured - cannot process real transactions")
      }

      // Parse private key and create merchant keypair
      const privateKeyArray = JSON.parse(process.env.CREATOR_PRIVATE_KEY)
      const merchantKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))

      console.log("🏪 Merchant wallet:", merchantKeypair.publicKey.toString())

      // Check merchant wallet balance
      const merchantBalance = await connection.getBalance(merchantKeypair.publicKey)
      const merchantSOL = merchantBalance / LAMPORTS_PER_SOL

      console.log(`💰 Merchant balance: ${merchantSOL.toFixed(4)} SOL`)

      if (merchantSOL < 0.01) {
        throw new Error(
          `Insufficient merchant wallet balance: ${merchantSOL.toFixed(4)} SOL. Need at least 0.01 SOL for transactions.`,
        )
      }

      // Validate customer wallet
      let customerPublicKey
      try {
        customerPublicKey = new PublicKey(walletAddress)
      } catch (error) {
        throw new Error("Invalid customer wallet address format")
      }

      // Check customer wallet balance
      const customerBalance = await connection.getBalance(customerPublicKey)
      const customerSOL = customerBalance / LAMPORTS_PER_SOL

      console.log(`👤 Customer balance: ${customerSOL.toFixed(4)} SOL`)

      const lamports = Math.floor(amount * LAMPORTS_PER_SOL)

      if (customerBalance < lamports) {
        throw new Error(`Customer has insufficient balance: ${customerSOL.toFixed(4)} SOL, needs ${amount} SOL`)
      }

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash("confirmed")

      // Create REAL transaction that customer will sign
      const transaction = new Transaction({
        feePayer: customerPublicKey,
        recentBlockhash: blockhash,
      })

      // Add transfer instruction (customer pays merchant)
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: customerPublicKey,
          toPubkey: merchantKeypair.publicKey,
          lamports: lamports,
        }),
      )

      // Serialize transaction for customer to sign
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })

      console.log("✅ REAL TRANSACTION CREATED - Customer must sign this")
      console.log(`💸 Amount: ${amount} SOL (${lamports} lamports)`)
      console.log(`🎯 From: ${walletAddress}`)
      console.log(`🏪 To: ${merchantKeypair.publicKey.toString()}`)

      // Return transaction for customer to sign
      return res.status(200).json({
        success: true,
        message: "🔥 REAL TRANSACTION READY - Customer must sign",
        transaction: serializedTransaction.toString("base64"),
        blockhash: blockhash,
        amount: amount,
        lamports: lamports,
        from: walletAddress,
        to: merchantKeypair.publicKey.toString(),
        mode: "REAL_PRODUCTION",
        note: "Customer wallet must sign this transaction",
      })
    }

    if (pathname === "/mint-nft") {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
      }

      console.log("🎨 REAL NFT MINTING - SPENDING ACTUAL SOL FOR NFT CREATION")
      const { walletAddress, metadata, transactionSignature } = req.body

      if (!walletAddress || !metadata) {
        return res.status(400).json({
          success: false,
          error: "Missing required parameters",
        })
      }

      // Verify we have private key
      if (!process.env.CREATOR_PRIVATE_KEY) {
        throw new Error("CREATOR_PRIVATE_KEY not configured - cannot mint real NFTs")
      }

      // Parse private key
      const privateKeyArray = JSON.parse(process.env.CREATOR_PRIVATE_KEY)
      const merchantKeypair = Keypair.fromSecretKey(new Uint8Array(privateKeyArray))

      console.log("🏪 Minting with wallet:", merchantKeypair.publicKey.toString())

      // Check merchant wallet balance for NFT creation fees
      const merchantBalance = await connection.getBalance(merchantKeypair.publicKey)
      const merchantSOL = merchantBalance / LAMPORTS_PER_SOL

      console.log(`💰 Merchant balance for NFT creation: ${merchantSOL.toFixed(4)} SOL`)

      if (merchantSOL < 0.01) {
        throw new Error(`Insufficient balance for NFT creation: ${merchantSOL.toFixed(4)} SOL. Need at least 0.01 SOL.`)
      }

      // Create UMI instance for REAL mainnet with same reliable endpoint
      const umi = createUmi("https://mainnet.helius-rpc.com/?api-key=demo")
      umi.use(mplTokenMetadata())

      // Convert Keypair to UMI format
      const umiKeypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(privateKeyArray))
      const signer = createSignerFromKeypair(umi, umiKeypair)
      umi.use(signerIdentity(signer))

      // Generate mint address
      const mint = generateSigner(umi)

      console.log("🎨 Creating REAL NFT on MAINNET with UMI...")
      console.log("💸 This will spend REAL SOL for:")
      console.log("   - Account creation fees")
      console.log("   - Metadata storage fees")
      console.log("   - Transaction fees")

      try {
        // Create the ACTUAL NFT on mainnet - THIS COSTS REAL SOL
        const result = await createNft(umi, {
          mint,
          name: metadata.name,
          symbol: "XENO",
          uri: `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`,
          sellerFeeBasisPoints: 500, // 5%
          creators: [
            {
              address: signer.publicKey,
              verified: true,
              share: 100,
            },
          ],
          isMutable: true,
        }).sendAndConfirm(umi) // ← THIS LINE ACTUALLY SENDS TO BLOCKCHAIN AND COSTS SOL

        const mintAddress = mint.publicKey.toString()

        console.log("🎉 REAL NFT SUCCESSFULLY MINTED ON MAINNET!")
        console.log("🎯 Mint address:", mintAddress)
        console.log("💸 Real SOL was spent for this NFT")

        // Verify the NFT exists on mainnet
        const nftAccount = await connection.getAccountInfo(new PublicKey(mintAddress))
        const verified = !!nftAccount

        console.log("✅ NFT verified on mainnet:", verified)

        // Check updated merchant balance
        const newBalance = await connection.getBalance(merchantKeypair.publicKey)
        const newSOL = newBalance / LAMPORTS_PER_SOL
        const spent = merchantSOL - newSOL

        console.log(`💰 SOL spent on NFT creation: ${spent.toFixed(6)} SOL`)
        console.log(`💰 Remaining balance: ${newSOL.toFixed(4)} SOL`)

        return res.status(200).json({
          success: true,
          mint_address: mintAddress,
          message: "🎉 REAL NFT MINTED ON MAINNET WITH REAL SOL!",
          explorer_url: `https://explorer.solana.com/address/${mintAddress}`,
          mode: "REAL_PRODUCTION",
          network: "mainnet-beta",
          verified: verified,
          solSpent: spent.toFixed(6),
          remainingBalance: newSOL.toFixed(4),
          transactionResult: result,
        })
      } catch (error) {
        console.error("❌ REAL NFT MINTING FAILED:", error)

        // Check if it's a balance issue
        if (error.message.includes("insufficient")) {
          throw new Error("Insufficient SOL balance for NFT creation. Please fund your merchant wallet.")
        }

        throw new Error(`NFT minting failed: ${error.message}`)
      }
    }

    return res.status(404).json({ error: "Endpoint not found" })
  } catch (error) {
    console.error("❌ REAL TRANSACTION ERROR:", error)
    return res.status(500).json({
      success: false,
      error: error.message,
      mode: "REAL_PRODUCTION_ERROR",
      note: "This was a real transaction attempt that failed",
    })
  }
}
