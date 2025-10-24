const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const Joi = require('joi');

const fsp = require('fs').promises;
let writeQueue = Promise.resolve();

const safeWriteJson = (filePath, obj) => {
  const data = JSON.stringify(obj, null, 2);
  // enqueue writes to avoid races
  writeQueue = writeQueue.then(() => fsp.writeFile(filePath, data, 'utf8'));
  return writeQueue;
};

const safeReadJson = async (filePath, defaultValue) => {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return defaultValue;
  }
};

const readPromiseWrapper = async (filePath, defaultValue) => {
  return await safeReadJson(filePath, defaultValue);
};

const app = express();


app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
const FMP_API_KEY = process.env.FMP_API_KEY; 

const investmentsFilePath = './investments.json';
const manualPricesFilePath = './manual_asset_prices.json';
const historicalPortfolioFilePath = './historical_portfolio_value.json';

const newInvestmentSchema = Joi.object({
  category: Joi.string().required(),
  name: Joi.string().required(),
  quantity: Joi.number().precision(8).min(0).required(),
  date: Joi.date().iso().required(),
  totalPurchasePrice: Joi.number().precision(2).min(0).required(),
  manualLivePrice: Joi.number().precision(2).optional().allow(null),
  currentValue: Joi.number().precision(2).optional()
});

// --- MAPPINGS ---
const cryptoIdMapping = {
    btc: 'bitcoin',
    eth: 'ethereum',
    xrp: 'ripple',
    sol: 'solana',
    doge: 'dogecoin',
    trump: 'maga'
};

const stockTickerMapping = {
    // Stocks
    'pateleng': 'PATELENG.NS',
    'tata steel': 'TATASTEEL.NS',
    'tata motors': 'TATAMOTORS.NS',
    // ETFs
    'juniorbees': 'JUNIORBEES.NS',
    'hdfcsml250': 'HDFCSML250.NS',
    'motilal-nasdaq 100': 'MON100.NS',
    'cpse etf': 'CPSEETF.NS',
    'nippon etf nifty midcap 150': 'MID150BEES.NS',
    'silverbees': 'SILVERBEES.NS',
    'mahaktech': 'MAHKTECH.NS',
    'sensexetf': 'SENSEXETF.NS',
    'nippon india etf gold bees': 'GOLDBEES.NS',
    'mirae asset nyse fang+etf': 'MAFANG.NS',
    'niftybees': 'NIFTYBEES.NS'
};

async function getLivePrice(inv, manualAssetPrices, cryptoPrices, stockPrices) {
    let livePrice = 0;
    const assetNameLower = (inv.name || '').toLowerCase();

    if (inv.category === 'Money') {
        livePrice = null; // Money doesn't have a per-unit live price
    } else if (manualAssetPrices[assetNameLower] !== undefined) {
        livePrice = parseFloat(manualAssetPrices[assetNameLower]) || 0;
    } else if (inv.category === 'Crypto' && cryptoIdMapping[assetNameLower] && cryptoPrices[cryptoIdMapping[assetNameLower]]) {
        livePrice = parseFloat(cryptoPrices[cryptoIdMapping[assetNameLower]].inr) || 0;
    } else if ((inv.category === 'Stocks' || inv.category === 'ETF Groww') && stockTickerMapping[assetNameLower] && stockPrices[stockTickerMapping[assetNameLower]]) {
        livePrice = parseFloat(stockPrices[stockTickerMapping[assetNameLower]]) || 0;
    }
    return livePrice;
}

// --- DATA FUNCTIONS ---
const readInvestments = async () => readPromiseWrapper(investmentsFilePath, []);

// ... (other data functions remain the same) ...
const writeInvestments = async (investments) => {
    await safeWriteJson(investmentsFilePath, investments);
};

const readManualPrices = async () => {
    return await safeReadJson(manualPricesFilePath, {});
};

const writeManualPrices = async (prices) => {
    await safeWriteJson(manualPricesFilePath, prices);
};

const readHistoricalData = async () => {
    return await safeReadJson(historicalPortfolioFilePath, []);
};

const writeHistoricalData = async (data) => {
    await safeWriteJson(historicalPortfolioFilePath, data);
};


// --- API ENDPOINT ---
app.get('/api/investments', async (req, res) => {
    console.log('--- New Request Received ---');
    const currentInvestments = await readInvestments();
    const manualAssetPrices = await readManualPrices();

    // 1. Fetch Crypto Prices
    let cryptoPrices = {};
    const cryptoInvestments = currentInvestments.filter(inv => inv.category === 'Crypto' && cryptoIdMapping[inv.name.toLowerCase()]);
    const cryptoIds = [...new Set(cryptoInvestments.map(inv => cryptoIdMapping[inv.name.toLowerCase()]))];
    if (cryptoIds.length > 0) {
        const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=inr`;
        console.log(`Fetching crypto prices from: ${apiUrl}`);
        try {
            const response = await axios.get(apiUrl);
            cryptoPrices = response.data;
            console.log("Received prices from CoinGecko:", JSON.stringify(cryptoPrices, null, 2));
        } catch (error) {
            console.error("Error fetching crypto prices from CoinGecko:", error.message);
        }
    }

    // 2. Fetch Stock and ETF Prices
    let stockPrices = {};
    const stockInvestments = currentInvestments.filter(inv => (inv.category === 'Stocks' || inv.category === 'ETF Groww') && stockTickerMapping[inv.name.toLowerCase()]);
    const stockTickers = [...new Set(stockInvestments.map(inv => stockTickerMapping[inv.name.toLowerCase()]))];
    if (stockTickers.length > 0 && FMP_API_KEY !== 'YOUR_API_KEY') {
        const apiUrl = `https://financialmodelingprep.com/api/v3/quote/${stockTickers.join(',')}?apikey=${FMP_API_KEY}`;
        console.log(`Fetching stock/ETF prices from: ${apiUrl}`);
        try {
            const response = await axios.get(apiUrl);
            // Process the array response from FMP into a map
            response.data.forEach(quote => {
                stockPrices[quote.symbol] = quote.price;
            });
            console.log("Received prices from FMP:", JSON.stringify(stockPrices, null, 2));
        } catch (error) {
            console.error("Error fetching stock/ETF prices from FMP:", error.message);
        }
    } else if (FMP_API_KEY === 'YOUR_API_KEY') {
        console.log("FMP_API_KEY is not set. Skipping stock/ETF price fetch.");
    }

    // 3. Process all investments
    let investmentsWithLivePrice = [];
    for (const inv of currentInvestments) {
        console.log(`Processing investment: ${inv.name} (Category: ${inv.category})`);

        // Normalize numeric fields and compute totals correctly
        const qty = parseFloat(inv.quantity) || 0;
        const totalPurchasePrice = (inv.totalPurchasePrice !== undefined && inv.totalPurchasePrice !== null)
          ? parseFloat(inv.totalPurchasePrice)
          : ((inv.purchasePricePerUnit !== undefined) ? parseFloat(inv.purchasePricePerUnit) * qty : 0);
        
        // Determine livePrice per unit using helper function
        const livePricePerUnit = await getLivePrice(inv, manualAssetPrices, cryptoPrices, stockPrices);
        
        // Compute current value & profit/loss
        let currentValue = 0;
        let profitOrLoss = 0;
        
        if (inv.category === 'Money') {
          currentValue = totalPurchasePrice; // Money is stored as absolute value
          profitOrLoss = 0;
        } else {
          currentValue = qty * (livePricePerUnit || 0);
          // Compare like with like: total purchase vs total current
          profitOrLoss = currentValue - totalPurchasePrice;
        }
        
        // Round numbers to 2 decimals for presentation
        const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
        
        investmentsWithLivePrice.push({
          ...inv,
          quantity: qty,
          livePricePerUnit: livePricePerUnit === null ? null : round(livePricePerUnit),
          currentValue: round(currentValue),
          profitOrLoss: round(profitOrLoss),
          totalPurchasePrice: round(totalPurchasePrice)
        });
    }

    console.log('--- Sending Response ---');
    res.json(investmentsWithLivePrice);
});

// ... (other endpoints like POST, DELETE remain the same) ...

app.post('/api/investments', async (req, res) => {
  const { error, value } = newInvestmentSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.details.map(d => d.message).join(', ') });

  const { category, name, quantity, date, totalPurchasePrice, manualLivePrice, currentValue } = value; // Use validated value
  try {
    const currentInvestments = await readInvestments();

    // Check for existing 'Money' investments
    if (category === 'Money') {
      const existingMoneyInvestment = currentInvestments.find(inv => inv.category === 'Money' && inv.name === name);
      if (existingMoneyInvestment) {
        return res.status(409).json({ error: `Money investment with name '${name}' already exists. Use the update endpoint for changes.` });
      }
    }

    const nextId = currentInvestments.length > 0 ? Math.max(...currentInvestments.map(i => i.id)) + 1 : 1;
    const newInvestment = { id: nextId, category, name, quantity, date, totalPurchasePrice, manualLivePrice, currentValue };
    const updatedInvestments = [...currentInvestments, newInvestment];
    await writeInvestments(updatedInvestments);
    res.status(201).json(newInvestment);
  } catch (err) {
    console.error('Error adding investment:', err);
    res.status(500).json({ error: 'Failed to add investment due to a server error.' });
  }
});

app.post('/api/investments/update-by-name', async (req, res) => {
    const { name, currentValue } = req.body;
    try {
        let investments = await readInvestments();
        const investmentIndex = investments.findIndex(inv => inv.name === name && inv.category === 'Money');

        if (investmentIndex !== -1) {
            investments[investmentIndex].currentValue = currentValue;
            await writeInvestments(investments);
            res.status(200).json(investments[investmentIndex]);
        } else {
            res.status(404).send('Investment not found');
        }
    } catch (err) {
        console.error('Error updating investment by name:', err);
        res.status(500).json({ error: 'Failed to update investment due to a server error.' });
    }
});

app.put('/api/manual-asset-prices/:assetName', async (req, res) => {
    const assetName = req.params.assetName.toLowerCase();
    const { price } = req.body;

    if (price === undefined || isNaN(parseFloat(price))) {
        return res.status(400).send('Invalid price provided');
    }

    try {
        const manualAssetPrices = await readManualPrices();
        manualAssetPrices[assetName] = parseFloat(price);
        await writeManualPrices(manualAssetPrices);
        res.json({ [assetName]: manualAssetPrices[assetName] });
    } catch (err) {
        console.error('Error updating manual asset price:', err);
        res.status(500).json({ error: 'Failed to update manual asset price due to a server error.' });
    }
});

app.delete('/api/investments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const currentInvestments = await readInvestments();
        const updatedInvestments = currentInvestments.filter(inv => inv.id !== parseInt(id));
        await writeInvestments(updatedInvestments);
        res.status(204).send();
    } catch (err) {
        console.error('Error deleting investment:', err);
        res.status(500).json({ error: 'Failed to delete investment due to a server error.' });
    }
});

app.get('/api/historical-portfolio-value', async (req, res) => {
    const historicalData = await readHistoricalData();
    res.json(historicalData);
});

app.post('/api/save-daily-snapshot', async (req, res) => {
    try {
        const currentInvestments = await readInvestments();
        const manualAssetPrices = await readManualPrices();

        // 1. Fetch Crypto Prices (reusing logic from GET /api/investments)
        let cryptoPrices = {};
        const cryptoInvestments = currentInvestments.filter(inv => inv.category === 'Crypto' && cryptoIdMapping[inv.name.toLowerCase()]);
        const cryptoIds = [...new Set(cryptoInvestments.map(inv => cryptoIdMapping[inv.name.toLowerCase()]))];
        if (cryptoIds.length > 0) {
            const apiUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds.join(',')}&vs_currencies=inr`;
            try {
                const response = await axios.get(apiUrl);
                cryptoPrices = response.data;
            } catch (error) {
                console.error("Error fetching crypto prices from CoinGecko for snapshot:", error.message);
            }
        }

        // 2. Fetch Stock and ETF Prices (reusing logic from GET /api/investments)
        let stockPrices = {};
        const stockInvestments = currentInvestments.filter(inv => (inv.category === 'Stocks' || inv.category === 'ETF Groww') && stockTickerMapping[inv.name.toLowerCase()]);
        const stockTickers = [...new Set(stockInvestments.map(inv => stockTickerMapping[inv.name.toLowerCase()]))];
        if (stockTickers.length > 0 && FMP_API_KEY !== 'YOUR_API_KEY') {
            const apiUrl = `https://financialmodelingprep.com/api/v3/quote/${stockTickers.join(',')}?apikey=${FMP_API_KEY}`;
            try {
                const response = await axios.get(apiUrl);
                response.data.forEach(quote => {
                    stockPrices[quote.symbol] = quote.price;
                });
            } catch (error) {
                console.error("Error fetching stock/ETF prices from FMP for snapshot:", error.message);
            }
        }

        // 3. Calculate total portfolio value
        let totalPortfolioValue = 0;
        for (const inv of currentInvestments) {
            const qty = parseFloat(inv.quantity) || 0;
            const livePricePerUnit = await getLivePrice(inv, manualAssetPrices, cryptoPrices, stockPrices);

            if (inv.category === 'Money') {
                totalPortfolioValue += (parseFloat(inv.totalPurchasePrice) || 0);
            } else {
                totalPortfolioValue += qty * (livePricePerUnit || 0);
            }
        }

        // Round total portfolio value to 2 decimal places
        const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
        totalPortfolioValue = round(totalPortfolioValue);

        // 4. Append to historical_portfolio_value.json
        const historicalData = await readHistoricalData();
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Check if a snapshot for today already exists and update it
        const existingSnapshotIndex = historicalData.findIndex(entry => entry.date === today);
        if (existingSnapshotIndex !== -1) {
            historicalData[existingSnapshotIndex].value = totalPortfolioValue;
        } else {
            historicalData.push({ date: today, value: totalPortfolioValue });
        }

        await writeHistoricalData(historicalData);

        res.status(200).json({ message: 'Daily snapshot saved successfully!', value: totalPortfolioValue });
    } catch (err) {
        console.error('Error saving daily snapshot:', err);
        res.status(500).json({ error: 'Failed to save daily snapshot due to a server error.' });
    }
});

// --- SECURITY / UTILITIES (basic) ---
const path = require('path');
const helmet = require('helmet'); // npm i helmet
const compression = require('compression'); // npm i compression
app.use(helmet());
app.use(compression());

// Serve React build if present (single-repo fullstack)
const buildDir = path.join(__dirname, 'build'); // if your CRA build is at ./client/build, change this path accordingly
if (require('fs').existsSync(buildDir)) {
  console.log('Found build dir, serving static files from', buildDir);
  app.use(express.static(buildDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildDir, 'index.html'));
  });
}

// Error-handling middleware (centralized)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
});

// Use the PORT environment variable (Render sets this)
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`Server is running on ${HOST}:${PORT}`);
});

// Graceful shutdown (close server on SIGTERM)
process.on('SIGTERM', () => {
  console.log('SIGTERM received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});
