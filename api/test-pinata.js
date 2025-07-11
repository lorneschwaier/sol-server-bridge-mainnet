export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end()
    return
  }

  try {
    if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_KEY) {
      return res.json({
        success: false,
        configured: false,
        error: "Pinata API credentials not configured",
      })
    }

    const axios = await import("axios")

    const testData = {
      pinataContent: {
        name: "Test NFT",
        description: "Test NFT metadata for Metaplex Core",
        image: "https://example.com/test.png",
        attributes: [{ trait_type: "Test", value: "Metaplex Core" }],
      },
    }

    const response = await axios.default.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", testData, {
      headers: {
        pinata_api_key: process.env.PINATA_API_KEY,
        pinata_secret_api_key: process.env.PINATA_SECRET_KEY,
      },
    })

    res.json({
      success: true,
      configured: true,
      url: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`,
      cid: response.data.IpfsHash,
      message: "Pinata working correctly for Metaplex Core metadata",
    })
  } catch (error) {
    res.json({
      success: false,
      configured: true,
      error: error.message,
    })
  }
}
