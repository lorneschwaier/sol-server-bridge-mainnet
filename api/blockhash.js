export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  try {
    const { Connection, clusterApiUrl } = await import("@solana/web3.js")
    const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed")
    const { blockhash } = await connection.getLatestBlockhash()

    res.status(200).json({
      success: true,
      blockhash: blockhash,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
}
