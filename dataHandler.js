// dataHandler.js

import { KrakenFuturesApi } from './krakenApi.js';

/**
 * @class DataHandler
 * @description A module responsible for fetching and consolidating all necessary data 
 *              for the trading bot using the Kraken API client.
 */
export class DataHandler {
    /**
     * @param {string} apiKey - Your Kraken Futures API key.
     * @param {string} apiSecret - Your Kraken Futures API secret.
     */
    constructor(apiKey, apiSecret) {
        if (!apiKey || !apiSecret) {
            throw new Error("API key and secret are required to initialize the DataHandler.");
        }
        // Instantiate the API client with credentials
        this.api = new KrakenFuturesApi(apiKey, apiSecret);
    }

    /**
     * Fetches all critical data points required for a trading decision cycle.
     * This includes market data (OHLC), account state (balance, positions, orders).
     * 
     * @param {string} pair - The trading pair for OHLC data (e.g., 'XBTUSD').
     * @param {number} interval - The OHLC candle interval in minutes (e.g., 60 for 1-hour).
     * @returns {Promise<object>} A consolidated object containing all fetched data.
     */
    async fetchAllData(pair = 'XBTUSD', interval = 60) {
        console.log("--- Starting data fetch cycle ---");
        try {
            // Use Promise.all to fetch data concurrently for efficiency
            const [
                ohlcData,
                accountBalance,
                openPositions,
                openOrders
            ] = await Promise.all([
                this.fetchOhlcData({ pair, interval }),
                this.fetchAccountBalance(),
                this.fetchOpenPositions(),
                this.fetchOpenOrders()
            ]);

            console.log("--- Data fetch cycle completed successfully ---");

            // Return a single, structured object
            return {
                ohlc: ohlcData,
                balance: accountBalance,
                positions: openPositions,
                orders: openOrders,
                // We can add trade history here later
                // tradeHistory: null 
            };

        } catch (error) {
            console.error("Error during the data fetch cycle:", error.message);
            // In a real bot, you might want more sophisticated error handling,
            // like retries or notifications.
            throw new Error("Failed to fetch all required data.");
        }
    }

    /**
     * Fetches OHLC (Open, High, Low, Close) data from Kraken's public spot API.
     * @param {object} params - Parameters for the OHLC request.
     * @param {string} params.pair - The asset pair (e.g., 'XBTUSD').
     * @param {number} params.interval - The time frame in minutes.
     * @returns {Promise<Array<object>|null>} Formatted OHLC data.
     */
    async fetchOhlcData({ pair, interval }) {
        console.log(`Fetching OHLC data for ${pair} with ${interval}m interval...`);
        const data = await this.api.fetchKrakenData({ pair, interval });
        console.log(`Successfully fetched ${data?.length || 0} OHLC candles.`);
        return data;
    }

    /**
     * Fetches account balance information from Kraken Futures.
     * @returns {Promise<object>} Account balance data.
     */
    async fetchAccountBalance() {
        console.log("Fetching account balance...");
        const data = await this.api.getAccounts();
        console.log("Successfully fetched account balance.");
        return data;
    }

    /**
     * Fetches all open positions from Kraken Futures.
     * @returns {Promise<object>} Open positions data.
     */
    async fetchOpenPositions() {
        console.log("Fetching open positions...");
        const data = await this.api.getOpenPositions();
        console.log(`Found ${data.openPositions?.length || 0} open positions.`);
        return data;
    }

    /**
     * Fetches all open (unfilled) orders from Kraken Futures.
     * @returns {Promise<object>} Open orders data.
     */
    async fetchOpenOrders() {
        console.log("Fetching open orders...");
        const data = await this.api.getOpenOrders();
        console.log(`Found ${data.openOrders?.length || 0} open orders.`);
        return data;
    }
}
