const fs = require('fs');

const investmentsFilePath = 'C:/Users/goyal/Desktop/Gemini/investment-tracker/backend/investments.json';
const manualPricesFilePath = 'C:/Users/goyal/Desktop/Gemini/investment-tracker/backend/manual_asset_prices.json';

console.log('Starting bank data removal...');

// Function to read investments from the file
const readInvestments = () => {
    try {
        const data = fs.readFileSync(investmentsFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading investments.json:', error.message);
        return [];
    }
};

// Function to write investments to the file
const writeInvestments = (investments) => {
    try {
        fs.writeFileSync(investmentsFilePath, JSON.stringify(investments, null, 2));
        console.log('investments.json updated successfully.');
    } catch (error) {
        console.error('Error writing investments.json:', error.message);
    }
};

// Function to read manual prices from the file
const readManualPrices = () => {
    try {
        const data = fs.readFileSync(manualPricesFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading manual_asset_prices.json:', error.message);
        return {};
    }
};

// Function to write manual prices to the file
const writeManualPrices = (prices) => {
    try {
        fs.writeFileSync(manualPricesFilePath, JSON.stringify(prices, null, 2));
        console.log('manual_asset_prices.json updated successfully.');
    } catch (error) {
        console.error('Error writing manual_asset_prices.json:', error.message);
    }
};

// --- Process investments.json ---
let investments = readInvestments();
const initialInvestmentCount = investments.length;
const filteredInvestments = investments.filter(inv => inv.category !== 'Bank');
if (filteredInvestments.length < initialInvestmentCount) {
    writeInvestments(filteredInvestments);
    console.log(`Removed ${initialInvestmentCount - filteredInvestments.length} bank investments.`);
} else {
    console.log('No bank investments found to remove.');
}

// --- Process manual_asset_prices.json ---
let manualAssetPrices = readManualPrices();
const initialManualPriceKeys = Object.keys(manualAssetPrices).length;
const bankSubCategories = ["pnb", "psb", "indian", "union", "indian overseas", "cash"];

const filteredManualPrices = {};
let removedManualPriceCount = 0;
for (const key in manualAssetPrices) {
    if (manualAssetPrices.hasOwnProperty(key) && !bankSubCategories.includes(key.toLowerCase())) {
        filteredManualPrices[key] = manualAssetPrices[key];
    } else {
        removedManualPriceCount++;
    }
}

if (removedManualPriceCount > 0) {
    writeManualPrices(filteredManualPrices);
    console.log(`Removed ${removedManualPriceCount} bank-related manual asset prices.`);
} else {
    console.log('No bank-related manual asset prices found to remove.');
}

console.log('Bank data removal process completed.');
