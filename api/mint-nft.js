export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { walletAddress, metadata } = req.body;

    // Use Crossmint API - actually works on Vercel
    const response = await fetch(
      `https://www.crossmint.com/api/2022-06-09/collections/${process.env.CROSSMINT_COLLECTION_ID}/nfts`,
      {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'x-api-key': process.env.CROSSMINT_API_KEY
        },
        body: JSON.stringify({
          recipient: `solana:${walletAddress}`,
          metadata: {
            name: metadata.name,
            image: metadata.image,
            description: metadata.description
          }
        })
      }
    );

    const result = await response.json();
    
    return res.status(200).json({
      success: true,
      mintAddress: result.id,
      transactionSignature: result.txId,
      message: "REAL NFT minted via Crossmint!"
    });

  } catch (error) {
    console.error("❌ Mint error:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
