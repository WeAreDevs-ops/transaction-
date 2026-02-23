const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPage(url, robloxSecurity, retries = 5) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      headers: {
        'Cookie': `.ROBLOSECURITY=${robloxSecurity}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.roblox.com/',
      },
    });

    if (response.status === 429) {
      // Exponential backoff: 2s, 4s, 8s, 16s, 32s
      const wait = Math.pow(2, attempt) * 1000;
      console.log(`429 on attempt ${attempt}, waiting ${wait}ms...`);
      await sleep(wait);
      continue;
    }

    return response;
  }
  throw new Error('Too many 429s — Roblox is rate limiting heavily. Try again later.');
}

// POST /api/fetch-transactions
// Body: { userId, robloxSecurity }
app.post('/api/fetch-transactions', async (req, res) => {
  const { userId, robloxSecurity } = req.body;

  if (!userId || !robloxSecurity) {
    return res.status(400).json({ error: 'userId and robloxSecurity are required.' });
  }

  const allData = [];
  let cursor = null;
  let pageCount = 0;

  // Increase timeout for long fetches (10 minutes)
  req.setTimeout(600000);
  res.setTimeout(600000);

  try {
    do {
      const urlObj = new URL(
        `https://economy.roblox.com/v2/users/${userId}/transactions`
      );
      urlObj.searchParams.set('transactionType', 'Purchase');
      urlObj.searchParams.set('limit', '100');
      urlObj.searchParams.set('sortOrder', 'Asc');
      if (cursor) urlObj.searchParams.set('cursor', cursor);

      const response = await fetchPage(urlObj.toString(), robloxSecurity);

      if (!response.ok) {
        const text = await response.text();
        return res.status(response.status).json({
          error: `Roblox API returned ${response.status}`,
          details: text,
        });
      }

      const json = await response.json();
      const items = json.data || [];
      allData.push(...items);
      cursor = json.nextPageCursor || null;
      pageCount++;

      console.log(`Page ${pageCount}: got ${items.length} items, cursor=${cursor ? 'yes' : 'null'}`);

      // Safety cap: 500 pages (50,000 transactions)
      if (pageCount >= 500) break;

      // Polite delay between requests: 600ms
      if (cursor) await sleep(600);

    } while (cursor !== null);

    res.json({
      totalTransactions: allData.length,
      totalPages: pageCount,
      data: allData,
    });

  } catch (err) {
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
