export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  try {
    if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: "Pinata API credentials not configured",
      })
    }

    const axios = await import("axios")

    const testMetadata = {
      name: "Test NFT",
      description: "This is a test NFT for Pinata connection",
      image: "https://example.com/test-image.png",
      attributes: [
        {
          trait_type: "Test",
          value: "Connection",
        },
      ],
    }

    console.log("🧪 Testing Pinata connection...")

    const response = await axios.default.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: testMetadata,
        pinataMetadata: {
          name: `test-metadata-${Date.now()}.json`,
        },
      },
      {
        headers: {
          pinata_api_key: process.env.PINATA_API_KEY,
          pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
        },
        timeout: 30000,
      },
    )

    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`

    console.log("✅ Pinata test successful:", metadataUrl)

    res.status(200).json({
      success: true,
      message: "Pinata connection test successful",
      ipfsHash: response.data.IpfsHash,
      metadataUrl: metadataUrl,
      testData: testMetadata,
    })
  } catch (error) {
    console.error("❌ Pinata test error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || "No additional details",
    })
  }
}
