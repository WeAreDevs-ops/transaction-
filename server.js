const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

  try {
    do {
      const url = new URL(
        `https://economy.roblox.com/v2/users/${userId}/transactions`
      );
      url.searchParams.set('transactionType', 'Purchase');
      url.searchParams.set('limit', '100');
      url.searchParams.set('sortOrder', 'Asc');
      if (cursor) url.searchParams.set('cursor', cursor);

      const response = await fetch(url.toString(), {
        headers: {
          'Cookie': `.ROBLOSECURITY=${robloxSecurity}`,
          'User-Agent': 'Mozilla/5.0',
          'Accept': 'application/json',
        },
      });

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

      // Safety cap: 500 pages (50,000 transactions)
      if (pageCount >= 500) break;

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
