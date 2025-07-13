export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  try {
    // Try to import and log what's available
    console.log("🔍 Checking installed packages...");
    
    const web3 = await import("@solana/web3.js");
    console.log("✅ @solana/web3.js:", !!web3);
    
    const splToken = await import("@solana/spl-token");
    console.log("✅ @solana/spl-token:", !!splToken);
    
    let metaplexAvailable = false;
    try {
      const metaplex = await import("@metaplex-foundation/mpl-token-metadata");
      console.log("✅ @metaplex-foundation/mpl-token-metadata:", !!metaplex);
      console.log("✅ createCreateMetadataAccountV3Instruction:", !!metaplex.createCreateMetadataAccountV3Instruction);
      console.log("✅ PROGRAM_ID:", !!metaplex.PROGRAM_ID);
      metaplexAvailable = true;
    } catch (error) {
      console.log("❌ @metaplex-foundation/mpl-token-metadata:", error.message);
    }
    
    return res.status(200).json({
      success: true,
      packages: {
        web3: !!web3,
        splToken: !!splToken,
        metaplex: metaplexAvailable
      },
      message: metaplexAvailable ? "All packages available" : "Metaplex package missing"
    });
    
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
