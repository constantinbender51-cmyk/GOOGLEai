// executionHandler.js

import { log } from './logger.js';

/**
 * @class ExecutionHandler
 * @description Handles the placement of orders on the exchange using batch orders.
 */
export class ExecutionHandler {
    constructor(api) {
        if (!api) {
            throw new Error("ExecutionHandler requires an instance of the KrakenFuturesApi client.");
        }
        this.api = api;
        log.info("ExecutionHandler initialized.");
    }

    /**
     * Places a complete trade using a batch of limit and stop orders.
     * @param {object} tradeDetails - The details of the trade to be executed.
     * @param {number} lastPrice - The current price of the asset, needed to set the entry limit price.
     * @returns {Promise<object>} The API response from the batch order placement.
     */
    async placeOrder({ signal, pair, params, lastPrice }) {
        const { size, stopLoss, takeProfit } = params;

        if (!['LONG', 'SHORT'].includes(signal) || !pair || !size || !stopLoss || !takeProfit || !lastPrice) {
            throw new Error("Invalid trade details provided to ExecutionHandler, lastPrice is required.");
        }

        const entrySide = (signal === 'LONG') ? 'buy' : 'sell';
        const closeSide = (signal === 'LONG') ? 'sell' : 'buy';

        // --- CRITICAL CHANGE: Create an aggressive limit price for the entry order ---
        // This makes the limit order behave like a market order.
        // We'll set the limit 0.1% away from the last price to ensure it fills.
        const slippagePercent = 0.001; 
        const entryLimitPrice = (signal === 'LONG')
            ? Math.round(lastPrice * (1 + slippagePercent))
            : Math.round(lastPrice * (1 - slippagePercent));

        log.info(`Preparing to place ${signal} order for ${size} BTC of ${pair}`);

        try {
            const batchOrderPayload = {
                batchOrder: [
                    // 1. The Main Entry Order (NOW A LIMIT ORDER)
                    {
                        order: 'send',
                        order_tag: '1',
                        orderType: 'lmt', // Changed from 'mkt' to 'lmt'
                        symbol: pair,
                        side: entrySide,
                        size: size,
                        limitPrice: entryLimitPrice, // Added aggressive limit price
                    },
                    // 2. The Stop-Loss Order (remains the same)
                    {
                        order: 'send',
                        order_tag: '2',
                        orderType: 'stp',
                        symbol: pair,
                        side: closeSide,
                        size: size,
                        stopPrice: stopLoss,
                        reduceOnly: true
                    },
                    // 3. The Take-Profit Order (remains the same)
                    {
                        order: 'send',
                        order_tag: '3',
                        orderType: 'lmt',
                        symbol: pair,
                        side: closeSide,
                        size: size,
                        limitPrice: takeProfit,
                        reduceOnly: true
                    }
                ]
            };

            log.info(`Sending corrected Batch Order (LMT entry) to Kraken: ${JSON.stringify(batchOrderPayload, null, 2)}`);

            const response = await this.api.batchOrder({ json: JSON.stringify(batchOrderPayload) });

            log.info(`Batch Order Response Received: ${JSON.stringify(response, null, 2)}`);

            if (response.result === 'success') {
                log.info("✅ Successfully placed batch order!");
            } else {
                log.error("❌ Failed to place batch order.", response);
            }

            return response;

        } catch (error) {
            log.error("❌ CRITICAL ERROR in ExecutionHandler during order placement:", error);
            throw error;
        }
    }
}
