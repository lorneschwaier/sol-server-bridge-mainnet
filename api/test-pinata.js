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
        message: "Please set PINATA_API_KEY and PINATA_SECRET_KEY environment variables",
      })
    }

    const axios = await import("axios")

    // Test uploading a simple JSON object to Pinata
    const testData = {
      name: "Test NFT Metadata",
      description: "This is a test upload to verify Pinata connection",
      image: "https://via.placeholder.com/500x500.png?text=Test+NFT",
      attributes: [
        {
          trait_type: "Test",
          value: "Connection",
        },
      ],
      timestamp: new Date().toISOString(),
    }

    console.log("🧪 Testing Pinata connection...")

    const response = await axios.default.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: testData,
        pinataMetadata: {
          name: `test-metadata-${Date.now()}.json`,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: process.env.PINATA_API_KEY,
          pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
        },
        timeout: 30000,
      },
    )

    const ipfsUrl = `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`

    console.log("✅ Pinata test successful!")
    console.log("📄 IPFS URL:", ipfsUrl)

    res.status(200).json({
      success: true,
      message: "Pinata connection test successful",
      data: {
        ipfsHash: response.data.IpfsHash,
        ipfsUrl: ipfsUrl,
        testData: testData,
        timestamp: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error("❌ Pinata test error:", error)

    let errorMessage = error.message
    let statusCode = 500

    if (error.response) {
      errorMessage = error.response.data?.error || error.response.statusText || error.message
      statusCode = error.response.status
      console.error("Response data:", error.response.data)
    }

    res.status(statusCode).json({
      success: false,
      error: "Pinata connection test failed",
      message: errorMessage,
      details: error.response?.data || null,
      timestamp: new Date().toISOString(),
    })
  }
}
