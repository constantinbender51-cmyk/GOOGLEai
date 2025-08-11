import { DataHandler } from './dataHandler.js';
import { StrategyEngine } from './strategyEngine.js'; // Import the new engine
import dotenv from 'dotenv';

dotenv.config();

const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY;
const KRAKEN_SECRET_KEY = process.env.KRAKEN_SECRET_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; // Ensure Gemini key is loaded

const TRADING_PAIR = 'PI_XBTUSD';
const CANDLE_INTERVAL = 60;

async function main() {
    console.log("Initializing Trading Bot...");

    if (!KRAKEN_API_KEY || !KRAKEN_SECRET_KEY || !GEMINI_API_KEY) {
        console.error("[FATAL] API keys are missing. Ensure KRAKEN_API_KEY, KRAKEN_SECRET_KEY, and GEMINI_API_KEY are in your .env file.");
        process.exit(1);
    }

    try {
        // 1. Initialize Modules
        const dataHandler = new DataHandler(KRAKEN_API_KEY, KRAKEN_SECRET_KEY);
        const strategyEngine = new StrategyEngine(); // Initialize the AI engine

        // 2. Fetch Market Data
        // In bot.js, inside the main() function, after fetching the data:

// ...
        const marketData = await dataHandler.fetchAllData(TRADING_PAIR, CANDLE_INTERVAL);
// Log the new data
        console.log("\nRecent Fills:", JSON.stringify(marketData.fills, null, 2));
// ...
        
        console.log("\n--- Data Fetch Complete ---");
        console.log(`Last candle close price: ${marketData.ohlc[marketData.ohlc.length - 1].close}`);

        // 3. Generate a Trading Signal
        console.log("\n--- Generating Trading Signal ---");
        const tradingSignal = await strategyEngine.generateSignal(marketData);

        // 4. Display the result
        console.log("\n--- Final Trading Decision ---");
        console.log(`Signal: ${tradingSignal.signal}`);
        console.log(`Reason: ${tradingSignal.reason}`);
        console.log("------------------------------");

    } catch (error) {
        console.error("\n[FATAL] A critical error occurred in the bot's main loop:", error.message);
        process.exit(1);
    }
}

main();
