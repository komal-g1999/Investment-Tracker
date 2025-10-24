const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// --- CONFIGURATION ---
// TODO: Add your free API key from financialmodelingprep.com here
const FMP_API_KEY = 'YOUR_API_KEY'; 

const investmentsFilePath = './investments.json';
const manualPricesFilePath = './manual_asset_prices.json';
const historicalPortfolioFilePath = './historical_portfolio_value.json';

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

// --- DATA FUNCTIONS ---
const readInvestments = () => {
    try {
        const data = fs.readFileSync(investmentsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

// ... (other data functions remain the same) ...
const writeInvestments = (investments) => {
    fs.writeFileSync(investmentsFilePath, JSON.stringify(investments, null, 2));
};

const readManualPrices = () => {
    try {
        const data = fs.readFileSync(manualPricesFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
};

const writeManualPrices = (prices) => {
    fs.writeFileSync(manualPricesFilePath, JSON.stringify(prices, null, 2));
};

const readHistoricalData = () => {
    try {
        const data = fs.readFileSync(historicalPortfolioFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

const writeHistoricalData = (data) => {
    fs.writeFileSync(historicalPortfolioFilePath, JSON.stringify(data, null, 2));
};


// --- API ENDPOINT ---
app.get('/api/investments', async (req, res) => {
    console.log('--- New Request Received ---');
    const currentInvestments = readInvestments();
    const manualAssetPrices = readManualPrices();

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

        let livePrice = 0;
        let currentValue = 0;
        let profitOrLoss = 0;
        const purchasePrice = inv.totalPurchasePrice !== undefined ? inv.totalPurchasePrice : (inv.purchasePricePerUnit || 0);

        if (inv.category === 'Money') {
            livePrice = null;
            currentValue = purchasePrice;
            profitOrLoss = 0;
        } else {
            const assetNameLower = inv.name.toLowerCase();
            const cryptoMappedId = cryptoIdMapping[assetNameLower];
            const stockMappedTicker = stockTickerMapping[assetNameLower];

            if (manualAssetPrices[assetNameLower] !== undefined) {
                livePrice = manualAssetPrices[assetNameLower];
                console.log(` -> Found manual price: ${livePrice}`);
            } else if (inv.category === 'Crypto' && cryptoMappedId && cryptoPrices[cryptoMappedId]) {
                livePrice = cryptoPrices[cryptoMappedId].inr;
                console.log(` -> Found live crypto price: ${livePrice}`);
            } else if ((inv.category === 'Stocks' || inv.category === 'ETF Groww') && stockMappedTicker && stockPrices[stockMappedTicker]) {
                livePrice = stockPrices[stockMappedTicker];
                console.log(` -> Found live stock/ETF price: ${livePrice}`);
            } else {
                console.log(` -> No price found. Defaulting to 0.`);
                livePrice = 0;
            }
            currentValue = inv.quantity * livePrice;
            profitOrLoss = currentValue - purchasePrice;
        }
        
        investmentsWithLivePrice.push({
            ...inv,
            livePricePerUnit: livePrice,
            currentValue: currentValue,
            profitOrLoss: profitOrLoss,
            totalPurchasePrice: purchasePrice
        });
    }

    console.log('--- Sending Response ---');
    res.json(investmentsWithLivePrice);
});

// ... (other endpoints like POST, DELETE remain the same) ...

app.post('/api/investments', (req, res) => {
    const { category, name, quantity, date, totalPurchasePrice, manualLivePrice, currentValue } = req.body;
    const currentInvestments = readInvestments();
    const nextId = currentInvestments.length > 0 ? Math.max(...currentInvestments.map(i => i.id)) + 1 : 1;
    const newInvestment = { id: nextId, category, name, quantity, date, totalPurchasePrice, manualLivePrice, currentValue };
    const updatedInvestments = [...currentInvestments, newInvestment];
    writeInvestments(updatedInvestments);
    res.status(201).json(newInvestment);
});

app.post('/api/investments/update-by-name', (req, res) => {
    const { name, currentValue } = req.body;
    let investments = readInvestments();
    const investmentIndex = investments.findIndex(inv => inv.name === name && inv.category === 'Money');

    if (investmentIndex !== -1) {
        investments[investmentIndex].currentValue = currentValue;
        writeInvestments(investments);
        res.status(200).json(investments[investmentIndex]);
    } else {
        res.status(404).send('Investment not found');
    }
});

app.put('/api/manual-asset-prices/:assetName', (req, res) => {
    const assetName = req.params.assetName.toLowerCase();
    const { price } = req.body;

    if (price === undefined || isNaN(parseFloat(price))) {
        return res.status(400).send('Invalid price provided');
    }

    const manualAssetPrices = readManualPrices();
    manualAssetPrices[assetName] = parseFloat(price);
    writeManualPrices(manualAssetPrices);
    res.json({ [assetName]: manualAssetPrices[assetName] });
});

app.delete('/api/investments/:id', (req, res) => {
    const { id } = req.params;
    const currentInvestments = readInvestments();
    const updatedInvestments = currentInvestments.filter(inv => inv.id !== parseInt(id));
    writeInvestments(updatedInvestments);
    res.status(204).send();
});

app.get('/api/historical-portfolio-value', (req, res) => {
    const historicalData = readHistoricalData();
    res.json(historicalData);
});

app.post('/api/save-daily-snapshot', (req, res) => {
    res.status(501).json({ message: "Snapshot endpoint needs to be updated for live prices." });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port} and is accessible on your network`);
});
