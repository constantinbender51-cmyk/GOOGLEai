// bot.js

import { DataHandler } from './dataHandler.js';

// --- Configuration ---
// IMPORTANT: Replace with your actual API keys.
// For better security, use environment variables (e.g., process.env.KRAKEN_API_KEY).
const KRAKEN_API_KEY = 'YOUR_API_KEY_HERE';
const KRAKEN_API_SECRET = 'YOUR_API_SECRET_HERE';
const TRADING_PAIR = 'PI_XBTUSD'; // Example: Perpetual BTC/USD
const CANDLE_INTERVAL = 60; // 60 minutes (1 hour)

/**
 * The main function to run the bot's logic.
 */
async function main() {
    console.log("Initializing Trading Bot...");

    try {
        // 1. Initialize the Data Handler
        const dataHandler = new DataHandler(KRAKEN_API_KEY, KRAKEN_API_SECRET);

        // 2. Fetch all data in one go
        const marketData = await dataHandler.fetchAllData(TRADING_PAIR, CANDLE_INTERVAL);

        // 3. Log the fetched data to see the results
        console.log("\n--- Consolidated Market Data ---");
        console.log("OHLC Data (first candle):", marketData.ohlc ? marketData.ohlc[0] : 'No data');
        console.log("\nAccount Balance:", JSON.stringify(marketData.balance, null, 2));
        console.log("\nOpen Positions:", JSON.stringify(marketData.positions, null, 2));
        console.log("\nOpen Orders:", JSON.stringify(marketData.orders, null, 2));
        console.log("---------------------------------");

    } catch (error) {
        console.error("\n[FATAL] A critical error occurred in the bot's main loop:", error.message);
        // In a real application, you might want to exit or attempt a restart.
        process.exit(1);
    }
}

// Run the main function
main();
