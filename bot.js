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
    // ... (try block and initializations)

    try {
        // 1. Initialize Modules
        const dataHandler = new DataHandler(process.env.KRAKEN_API_KEY, process.env.KRAKEN_SECRET_KEY);
        const strategyEngine = new StrategyEngine();
        
        // Configure the RiskManager to use 10x leverage
        const riskManager = new RiskManager({
            leverage: 10,
            stopLossMultiplier: 2,   // Keep using ATR for a dynamic stop
            takeProfitMultiplier: 3  // Keep a 3:1 risk-reward target
        });

        const executionHandler = new ExecutionHandler(dataHandler.api);

        // ... (the rest of the main function remains the same)
        
        // 2. Fetch Market Data
        const marketData = await dataHandler.fetchAllData('PI_XBTUSD', 60);
        
        if (marketData.positions?.openPositions?.length > 0) {
            console.log("\n--- Position Already Open, skipping new trade. ---");
            return;
        }

        // 3. Generate Signal
        const tradingSignal = await strategyEngine.generateSignal(marketData);

        // 4. Calculate Parameters and Execute
        if (tradingSignal.signal !== 'HOLD') {
            const tradeParams = riskManager.calculateTradeParameters(marketData, tradingSignal);

            if (tradeParams) {
                await executionHandler.placeOrder({
                    signal: tradingSignal.signal,
                    pair: 'PI_XBTUSD',
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
