// bot.js

import { DataHandler } from './dataHandler.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// --- Configuration ---
// Load API keys securely from environment variables
const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY;
const KRAKEN_SECRET_KEY = process.env.KRAKEN_SECRET_KEY;

// Trading parameters
const TRADING_PAIR = 'PI_XBTUSD'; // Example: Perpetual BTC/USD
const CANDLE_INTERVAL = 60;      // 60 minutes (1 hour)

/**
 * The main function to run the bot's logic.
 */
async function main() {
    console.log("Initializing Trading Bot...");

    // --- Security Check ---
    // Ensure API keys are loaded before proceeding
    if (!KRAKEN_API_KEY || !KRAKEN_SECRET_KEY) {
        console.error("[FATAL] API keys are not found. Make sure you have a .env file with KRAKEN_API_KEY and KRAKEN_SECRET_KEY.");
        process.exit(1); // Exit if keys are missing
    }

    try {
        // 1. Initialize the Data Handler with keys from .env
        const dataHandler = new DataHandler(KRAKEN_API_KEY, KRAKEN_SECRET_KEY);

        // 2. Fetch all data in one go
        const marketData = await dataHandler.fetchAllData(TRADING_PAIR, CANDLE_INTERVAL);

        // 3. Log the fetched data to see the results
        console.log("\n--- Consolidated Market Data ---");
        console.log(`OHLC Data for ${TRADING_PAIR} (Last Candle):`, marketData.ohlc ? marketData.ohlc[marketData.ohlc.length - 1] : 'No data');
        console.log("\nAccount Balance:", JSON.stringify(marketData.balance, null, 2));
        console.log("\nOpen Positions:", JSON.stringify(marketData.positions, null, 2));
        console.log("\nOpen Orders:", JSON.stringify(marketData.orders, null, 2));
        console.log("---------------------------------");

    } catch (error) {
        console.error("\n[FATAL] A critical error occurred in the bot's main loop:", error.message);
        process.exit(1);
    }
}

// Run the main function
main();
