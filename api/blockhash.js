// Add Buffer polyfill at the very top
const { Buffer } = require('buffer');
if (typeof global !== 'undefined') {
  global.Buffer = Buffer;
}

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
    // Dynamic import
    const { Connection, clusterApiUrl } = await import("@solana/web3.js")
    
    // Environment variables with debugging
    const SOLANA_NETWORK = process.env.SOLANA_NETWORK || "mainnet-beta"
    const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 
      (SOLANA_NETWORK === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : clusterApiUrl(SOLANA_NETWORK))
    
    // Debug logging
    console.log("🔍 Using RPC URL:", SOLANA_RPC_URL);
    console.log("🔍 Network:", SOLANA_NETWORK);
    
    // Initialize connection with timeout
    const connection = new Connection(SOLANA_RPC_URL, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 30000
    })
    
    // Get latest blockhash with retry logic
    let blockhash;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const result = await connection.getLatestBlockhash("confirmed")
        blockhash = result.blockhash;
        break;
      } catch (error) {
        attempts++;
        console.log(`❌ Attempt ${attempts} failed:`, error.message);
        
        if (attempts >= maxAttempts) {
          throw error;
        }
        
        // Wait 1 second before retry
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log("✅ Latest blockhash:", blockhash)
    
    res.status(200).json({
      success: true,
      blockhash: blockhash,
      network: SOLANA_NETWORK,
      rpcUrl: SOLANA_RPC_URL
    })
    
  } catch (error) {
    console.error("❌ Blockhash error:", error)
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    })
  }
}
