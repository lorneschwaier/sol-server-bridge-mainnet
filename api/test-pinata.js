export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  try {
    const PINATA_API_KEY = process.env.PINATA_API_KEY
    const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY

    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        error: "Pinata API credentials not configured",
      })
    }

    const axios = (await import("axios")).default

    // Test metadata
    const testMetadata = {
      name: "Test NFT",
      description: "Test NFT for Pinata connection",
      image: "https://via.placeholder.com/500",
      attributes: [
        {
          trait_type: "Test",
          value: "Connection",
        },
      ],
    }

    console.log("Testing Pinata connection...")

    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: testMetadata,
        pinataMetadata: {
          name: "test-metadata.json",
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

    res.status(200).json({
      success: true,
      message: "Pinata connection successful",
      ipfsHash: response.data.IpfsHash,
      metadataUrl,
      testMetadata,
    })
  } catch (error) {
    console.error("Pinata test error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data || "Unknown error",
    })
  }
}
