import express from 'express';
import { paymentMiddleware } from 'x402-express';
import 'dotenv/config';

const app = express();
app.use(express.json());

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402.org/facilitator';
const NETWORK = process.env.NETWORK || 'base-sepolia';

if (!WALLET_ADDRESS) {
  console.error('❌ WALLET_ADDRESS is required. Set it in .env or environment.');
  process.exit(1);
}

// --- Health Check (no payment required) ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Your API Endpoint ---
// Replace this with your actual business logic.
// The payment middleware verifies x402 payment before your handler runs.
app.get(
  '/api/your-tool',
  paymentMiddleware(FACILITATOR_URL, WALLET_ADDRESS, {
    network: NETWORK,
    description: 'Your Tool — describe what this endpoint does',
  }),
  async (req, res) => {
    try {
      const { input } = req.query;

      if (!input) {
        return res.status(400).json({ error: 'Missing required parameter: input' });
      }

      // ============================================
      // YOUR BUSINESS LOGIC HERE
      // ============================================
      const result = {
        input,
        output: `Processed: ${input}`,
        timestamp: new Date().toISOString(),
      };
      // ============================================

      res.json(result);
    } catch (err) {
      console.error('Error processing request:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 API server running on port ${PORT}`);
  console.log(`💰 Payments to: ${WALLET_ADDRESS}`);
  console.log(`🔗 Facilitator: ${FACILITATOR_URL}`);
  console.log(`🌐 Network: ${NETWORK}`);
});
