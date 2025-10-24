const fs = require('fs');
const investmentsFilePath = 'C:/Users/goyal/Desktop/Gemini/investment-tracker/backend/investments.json';
const historicalPortfolioFilePath = 'C:/Users/goyal/Desktop/Gemini/investment-tracker/backend/historical_portfolio_value.json';

console.log('Starting historical data generation...');

const readInvestments = () => {
    try {
        const data = fs.readFileSync(investmentsFilePath, 'utf8');
        console.log('investments.json read successfully.');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading investments.json:', error.message);
        return [];
    }
};

const writeHistoricalData = (data) => {
    try {
        fs.writeFileSync(historicalPortfolioFilePath, JSON.stringify(data, null, 2));
        console.log('historical_portfolio_value.json written successfully.');
    } catch (error) {
        console.error('Error writing historical_portfolio_value.json:', error.message);
    }
};

const investments = readInvestments();
console.log(`Found ${investments.length} investments.`);

const historicalData = [];

const startDate = new Date('2024-01-01T00:00:00Z'); // Use UTC to avoid timezone issues
const today = new Date();
today.setUTCHours(0, 0, 0, 0); // Set to beginning of today in UTC

console.log(`Generating data from ${startDate.toISOString().slice(0, 10)} to ${today.toISOString().slice(0, 10)}`);

let currentDate = new Date(startDate);

while (currentDate <= today) {
    const dateString = currentDate.toISOString().slice(0, 10);
    let cumulativePurchasePrice = 0;

    investments.forEach(inv => {
        const investmentDate = new Date(inv.date + 'T00:00:00Z'); // Ensure investment date is also UTC
        if (investmentDate <= currentDate) {
            cumulativePurchasePrice += inv.totalPurchasePrice || 0;
        }
    });

    historicalData.push({ date: dateString, value: cumulativePurchasePrice });
    currentDate.setUTCDate(currentDate.getUTCDate() + 1); // Increment day in UTC
}

writeHistoricalData(historicalData);
console.log('historical_portfolio_value.json generation process completed.');
