export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  try {
    const axios = await import("axios")

    const testData = {
      name: "Test NFT",
      description: "This is a test NFT for Pinata connection",
      image: "https://via.placeholder.com/512x512.png?text=Test+NFT",
      attributes: [],
    }

    const response = await axios.default.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", testData, {
      headers: {
        "Content-Type": "application/json",
        pinata_api_key: process.env.PINATA_API_KEY,
        pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
      },
    })

    res.status(200).json({
      success: true,
      message: "Pinata connection successful",
      ipfsHash: response.data.IpfsHash,
      ipfsUrl: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`,
      testData,
    })
  } catch (error) {
    console.error("Pinata test error:", error)
    res.status(500).json({
      error: "Pinata test failed",
      message: error.message,
      details: error.response?.data || "No additional details",
    })
  }
}
