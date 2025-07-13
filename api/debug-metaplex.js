export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  try {
    console.log("🔍 Debugging Metaplex package...");
    
    const metaplexLib = await import("@metaplex-foundation/mpl-token-metadata");
    
    const allKeys = Object.keys(metaplexLib);
    const metadataFunctions = allKeys.filter(key => key.toLowerCase().includes('metadata'));
    const programIds = allKeys.filter(key => key.includes('PROGRAM'));
    const createFunctions = allKeys.filter(key => key.toLowerCase().includes('create'));
    
    console.log("📋 All exports:", allKeys);
    console.log("📝 Metadata functions:", metadataFunctions);
    console.log("🆔 Program IDs:", programIds);
    console.log("🏗️ Create functions:", createFunctions);
    
    return res.status(200).json({
      success: true,
      allKeys: allKeys,
      metadataFunctions: metadataFunctions,
      programIds: programIds,
      createFunctions: createFunctions
    });
    
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
