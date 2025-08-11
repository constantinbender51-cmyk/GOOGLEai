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
        this.api = new KrakenFuturesApi(apiKey, apiSecret);
    }

    /**
     * Fetches all critical data points required for a trading decision cycle.
     * @param {string} pair - The trading pair for OHLC data (e.g., 'XBTUSD').
     * @param {number} interval - The OHLC candle interval in minutes.
     * @returns {Promise<object>} A consolidated object containing all fetched data.
     */
    async fetchAllData(pair = 'XBTUSD', interval = 60) {
        console.log("--- Starting data fetch cycle ---");
        try {
            // Use Promise.all to fetch all data concurrently
            const [
                ohlcData,
                accountBalance,
                openPositions,
                openOrders,
                recentFills // Add recentFills to the concurrent fetch
            ] = await Promise.all([
                this.fetchOhlcData({ pair, interval }),
                this.fetchAccountBalance(),
                this.fetchOpenPositions(),
                this.fetchOpenOrders(),
                this.fetchRecentFills() // Call the new method
            ]);

            console.log("--- Data fetch cycle completed successfully ---");

            // Return a single, structured object with the new data
            return {
                ohlc: ohlcData,
                balance: accountBalance,
                positions: openPositions,
                orders: openOrders,
                fills: recentFills // Add fills to the final object
            };

        } catch (error) {
            console.error("Error during the data fetch cycle:", error.message);
            throw new Error("Failed to fetch all required data.");
        }
    }

    /**
     * Fetches OHLC data from Kraken's public spot API.
     * @param {object} params - Parameters for the OHLC request.
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

    /**
     * Fetches the most recent executed trades (fills) from Kraken Futures.
     * @returns {Promise<object>} Fills data.
     */
    async fetchRecentFills() {
        console.log("Fetching recent fills (trade history)...");
        // We can add parameters here later if we need to paginate, e.g., { lastFillTime: '...' }
        const data = await this.api.getFills();
        console.log(`Successfully fetched ${data.fills?.length || 0} recent fills.`);
        return data;
    }
}
