// backtest.js

import { BacktestRunner } from './backtestRunner.js';
import { log } from './logger.js';

// --- Configuration ---
// All configuration is now in one place.
const config = {
    INITIAL_BALANCE: 10000,
    MINIMUM_CONFIDENCE_THRESHOLD: 50,
    MIN_SECONDS_BETWEEN_CALLS: 60,
    MAX_API_CALLS: 10,
    DATA_WINDOW_SIZE: 240,
    WARMUP_PERIOD: 240,
    LEVERAGE: 10,
    MARGIN_BUFFER: 0.01
};

/**
 * The main entry point for the backtesting application.
 */
async function main() {
    log.info('--- Initializing Backtest Application ---');
    try {
        // --- THIS IS THE FIX ---
        // We no longer call any data fetcher here.
        // We simply create a runner and tell it to run.
        // It will handle all its own data needs from the database.
        const runner = new BacktestRunner(config);
        await runner.run();
        
        log.info('--- Backtest Application Finished ---');
    } catch (error) {
        log.error("A critical error occurred during the backtest process:", error);
        process.exit(1); // Exit with an error code
    }
}

// Run the application
main();
