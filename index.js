const express = require("express")
const cors = require("cors")
require("dotenv").config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "Solana NFT Bridge Server is running",
    timestamp: new Date().toISOString(),
    network: process.env.SOLANA_NETWORK || "mainnet-beta",
    environment: {
      pinataConfigured: !!(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY),
      creatorKeyConfigured: !!process.env.CREATOR_PRIVATE_KEY,
    },
  })
})

// Start server (only if not in Vercel environment)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Solana NFT Bridge Server running on port ${PORT}`)
    console.log(`📡 Network: ${process.env.SOLANA_NETWORK || "mainnet-beta"}`)
    console.log(`🔑 Creator key configured: ${!!process.env.CREATOR_PRIVATE_KEY}`)
    console.log(`📎 Pinata configured: ${!!(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY)}`)
  })
}

module.exports = app
