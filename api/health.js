// Simple health check endpoint
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  return res.status(200).json({
    status: "healthy",
    network: "mainnet-beta",
    timestamp: new Date().toISOString(),
    message: "Bridge server is working!",
  })
}
