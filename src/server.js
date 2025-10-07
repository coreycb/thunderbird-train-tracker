import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getStatus } from "./fetcher.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public/ directory with cache disabled
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  lastModified: false,
  maxAge: 0,
  setHeaders(res) {
    res.set('Cache-Control', 'no-store');
  }
}));

/**
 * API endpoint that returns Thunderbird version and milestone data.
 * Fetches current data from multiple sources via getStatus().
 *
 * @route GET /api/status
 * @returns {Object} JSON containing fetchedAt, channels, and events
 */
app.get('/api/status', async (req, res) => {
  try {
    const status = await getStatus();
    res.json(status);
  } catch (err) {
    console.error('Error fetching status', err);
    res.status(500).json({ error: 'Failed to fetch status', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Thunderbird Version Tracker listening on http://localhost:${PORT}`);
});
