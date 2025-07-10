export default async function handler(req, res) {
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
      image: "https://via.placeholder.com/500x500.png?text=Test+NFT",
      attributes: [
        {
          trait_type: "Test",
          value: "True",
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

    res.status(200).json({
      success: true,
      message: "Pinata connection successful",
      data: {
        ipfsHash: response.data.IpfsHash,
        metadataUrl: metadataUrl,
        timestamp: response.data.Timestamp,
      },
    })
  } catch (error) {
    console.error("❌ Pinata test error:", error)
    res.status(500).json({
      success: false,
      error: "Pinata test failed",
      message: error.message,
    })
  }
}
