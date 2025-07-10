const axios = require("axios")

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const PINATA_API_KEY = process.env.PINATA_API_KEY
  const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY

  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    return res.status(400).json({
      error: "Pinata credentials not configured",
      message: "Please set PINATA_API_KEY and PINATA_SECRET_KEY environment variables",
    })
  }

  try {
    // Test Pinata connection by uploading a simple JSON
    const testData = {
      message: "Test from Solana NFT Bridge",
      timestamp: new Date().toISOString(),
    }

    const response = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", testData, {
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    })

    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`

    res.status(200).json({
      success: true,
      message: "Pinata connection successful",
      data: {
        ipfsHash: response.data.IpfsHash,
        ipfsUrl,
        pinataResponse: response.data,
      },
    })
  } catch (error) {
    console.error("Pinata test error:", error.response?.data || error.message)

    res.status(500).json({
      success: false,
      error: "Pinata connection failed",
      message: error.response?.data?.error || error.message,
      details: error.response?.data || error.stack,
    })
  }
}
