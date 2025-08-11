// bot.js

import { DataHandler } from './dataHandler.js';
import { StrategyEngine } from './strategyEngine.js';
import { RiskManager } from './riskManager.js';
import { ExecutionHandler } from './executionHandler.js'; // Import the final module
import dotenv from 'dotenv';

dotenv.config();

// ... (API key loading)

const TRADING_PAIR = 'PI_XBTUSD';
const CANDLE_INTERVAL = 60;

async function main() {
    // ... (error checking for keys)

    try {
        // 1. Initialize All Modules
        const dataHandler = new DataHandler(process.env.KRAKEN_API_KEY, process.env.KRAKEN_SECRET_KEY);
        const strategyEngine = new StrategyEngine();
        const riskManager = new RiskManager({ riskPercentage: 1.0 });
        // The ExecutionHandler needs the API client from the DataHandler
        const executionHandler = new ExecutionHandler(dataHandler.api);

        // 2. Fetch Market Data
        const marketData = await dataHandler.fetchAllData(TRADING_PAIR, CANDLE_INTERVAL);
        
        // --- ADDED LOGIC: Check for existing positions before trading ---
        if (marketData.positions?.openPositions?.length > 0) {
            console.log("\n--- Position Already Open ---");
            console.log("Skipping new trade signal to avoid multiple concurrent positions.");
            console.log("Current positions:", JSON.stringify(marketData.positions.openPositions, null, 2));
            return; // Exit the cycle
        }

        // 3. Generate a Trading Signal
        const tradingSignal = await strategyEngine.generateSignal(marketData);

        // 4. Calculate Trade Parameters
        if (tradingSignal.signal !== 'HOLD') {
            const tradeParams = riskManager.calculateTradeParameters(marketData, tradingSignal);

            if (tradeParams) {
                // 5. EXECUTE THE TRADE
                await executionHandler.placeOrder({
                    signal: tradingSignal.signal,
                    pair: TRADING_PAIR,
                    params: tradeParams
                });
            } else {
                console.log("\n--- Trade Execution Skipped by Risk Manager ---");
            }
        } else {
            console.log("\n--- AI Signal is HOLD. No action taken. ---");
        }

    } catch (error) {
        console.error("\n[FATAL] A critical error occurred in the bot's main loop:", error.message);
        process.exit(1);
    }
}

main();
