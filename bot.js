// bot.js

import { startWebServer } from './webServer.js'; // Import the web server
import { DataHandler } from './dataHandler.js';
import { StrategyEngine } from './strategyEngine.js';
import { RiskManager } from './riskManager.js';
import { ExecutionHandler } from './executionHandler.js';
import { log } from './logger.js'; // Import our new logger
import dotenv from 'dotenv';

dotenv.config();

// --- Start the Web Server ---
// We start it outside the main logic so the UI is always available.
startWebServer();

// ... (Configuration remains the same)
const FUTURES_TRADING_PAIR = 'PF_XBTUSD';
const OHLC_DATA_PAIR = 'XBTUSD';
const CANDLE_INTERVAL = 60;
const MINIMUM_CONFIDENCE_THRESHOLD = 70; // <-- New setting! Only trade on signals with 70+ confidence.

async function main() {
    log.info(`==================================================`);
    log.info(`Bot trading cycle starting for ${FUTURES_TRADING_PAIR}...`);
    log.info(`Minimum confidence threshold set to: ${MINIMUM_CONFIDENCE_THRESHOLD}`);
    const KRAKEN_API_KEY = process.env.KRAKEN_API_KEY;
    const KRAKEN_SECRET_KEY = process.env.KRAKEN_SECRET_KEY;
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!KRAKEN_API_KEY || !KRAKEN_SECRET_KEY || !GEMINI_API_KEY) {
        log.error("[FATAL] API keys are missing. Ensure all required keys are in your .env file.");
        process.exit(1);
    }

    try {
        // Initialize modules
        const dataHandler = new DataHandler(KRAKEN_API_KEY, KRAKEN_SECRET_KEY);
        const strategyEngine = new StrategyEngine();
        const riskManager = new RiskManager({ leverage: 10 });
        const executionHandler = new ExecutionHandler(dataHandler.api);

        // Fetch data
        log.info("Fetching market and account data...");
        const marketData = await dataHandler.fetchAllData(OHLC_DATA_PAIR, CANDLE_INTERVAL);
        
        const openPositions = marketData.positions?.openPositions?.filter(p => p.symbol === FUTURES_TRADING_PAIR) || [];
        if (openPositions.length > 0) {
            log.info(`Position already open for ${FUTURES_TRADING_PAIR}. Skipping new trade.`);
            return;
        }

        // Generate signal
        log.info("Generating trading signal from AI...");
        const tradingSignal = await strategyEngine.generateSignal(marketData);
        log.info(`AI Signal: ${tradingSignal.signal} | Reason: ${tradingSignal.reason}`);

        // <<-- NEW LOGIC: Check both signal and confidence -->>
        if (tradingSignal.signal !== 'HOLD' && tradingSignal.confidence >= MINIMUM_CONFIDENCE_THRESHOLD) {
            log.info(`High-confidence signal received (${tradingSignal.confidence} >= ${MINIMUM_CONFIDENCE_THRESHOLD}). Proceeding to risk management.`);
            
            const tradeParams = riskManager.calculateTradeParameters(marketData, tradingSignal);

            if (tradeParams) {
                log.info(`Executing trade with params: ${JSON.stringify(tradeParams)}`);
                await executionHandler.placeOrder({
                    signal: tradingSignal.signal,
                    pair: FUTURES_TRADING_PAIR,
                    params: tradeParams
                });
                log.info("Trade execution process completed.");
            } else {
                log.warn("Trade execution skipped by Risk Manager (e.g., zero size).");
            }
        } else {
            if (tradingSignal.signal === 'HOLD') {
                log.info("AI Signal is HOLD. No action taken.");
            } else {
                log.info(`Signal (${tradingSignal.signal}) received, but confidence (${tradingSignal.confidence}) is below threshold of ${MINIMUM_CONFIDENCE_THRESHOLD}. No action taken.`);
            }
        }

    } catch (error) {
        log.error("[FATAL] A critical error occurred in the bot's main loop:", error);
    } finally {
        log.info("Bot trading cycle finished.");
    }
}

// ... (main loop interval logic)
// We will now wrap the main logic in a loop to run continuously.
// Let's run the trading cycle every hour (3600 * 1000 milliseconds).
const TRADING_INTERVAL_MS = 3600 * 1000;

log.info(`Bot configured to run trading cycle every ${TRADING_INTERVAL_MS / 1000 / 60} minutes.`);
main();
