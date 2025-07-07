export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { walletAddress, amount, productId } = req.body;

    if (!walletAddress || !amount || !productId) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    console.log("💰 Received request to process payment:", { walletAddress, amount, productId });

    // TODO: Replace this with real transaction logic when ready
    const mockSignature = `DEMO_TX_${Date.now()}`;

    return res.status(200).json({
      success: true,
      signature: mockSignature,
    });
  } catch (err) {
    console.error("❌ Error in send-tx:", err);
    return res.status(500).json({ success: false, error: err.message || "Unknown server error" });
  }
}

