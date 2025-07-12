export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  try {
    const axios = (await import("axios")).default

    const PINATA_API_KEY = process.env.PINATA_API_KEY
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY

    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: "Pinata API credentials not configured",
      })
    }

    // Test metadata
    const testMetadata = {
      name: "Test NFT",
      description: "This is a test NFT for Pinata connection",
      image: "https://via.placeholder.com/500x500.png?text=Test+NFT",
      attributes: [
        {
          trait_type: "Test",
          value: "Connection",
        },
      ],
    }

    console.log("🧪 Testing Pinata connection...")

    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: testMetadata,
        pinataMetadata: {
          name: `test-metadata-${Date.now()}.json`,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
        },
      },
    )

    const metadataUrl = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`

    console.log("✅ Pinata test successful!")
    console.log("   - IPFS Hash:", response.data.IpfsHash)
    console.log("   - URL:", metadataUrl)

    res.status(200).json({
      success: true,
      message: "Pinata connection successful!",
      ipfsHash: response.data.IpfsHash,
      metadataUrl,
      testData: testMetadata,
    })
  } catch (error) {
    console.error("❌ Pinata test error:", error)

    let errorMessage = error.message
    if (error.response) {
      errorMessage = `HTTP ${error.response.status}: ${error.response.data?.error || error.response.statusText}`
    }

    res.status(500).json({
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    })
  }
}
