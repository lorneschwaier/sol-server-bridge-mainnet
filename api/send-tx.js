// Clean payment processing endpoint
export default async function handler(req, res) {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    console.log("💸 Processing SOL payment request");

    const { walletAddress, amount, productId } = req.body;

    if (!walletAddress || !amount || !productId) {
      return res.status(400).json({
        success: false,
        error: "Missing required parameters",
      });
    }

    // Generate mock signature for demo
    const fakeSignature = `DEMO_TX_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    console.log("✅ Payment received (DEMO):", {
      wallet: walletAddress,
      amount,
      productId,
      signature: fakeSignature,
    });

    return res.status(200).json({
      success: true,
      signature: fakeSignature,
      message: "✅ Demo payment processed",
      mode: "DEMO",
    });
  } catch (error) {
    console.error("❌ Payment error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
