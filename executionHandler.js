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
     * Places a complete trade using a batch of limit and stop-limit orders.
     * @param {object} tradeDetails - The details of the trade to be executed.
     * @returns {Promise<object>} The API response from the batch order placement.
     */
    async placeOrder({ signal, pair, params, lastPrice }) {
        const { size, stopLoss, takeProfit } = params;

        if (!['LONG', 'SHORT'].includes(signal) || !pair || !size || !stopLoss || !takeProfit || !lastPrice) {
            throw new Error("Invalid trade details provided to ExecutionHandler, lastPrice is required.");
        }

        const entrySide = (signal === 'LONG') ? 'buy' : 'sell';
        const closeSide = (signal === 'LONG') ? 'sell' : 'buy';

        // Aggressive limit price for the entry order to mimic a market order
        const entrySlippagePercent = 0.001; // 0.1%
        const entryLimitPrice = (signal === 'LONG')
            ? Math.round(lastPrice * (1 + entrySlippagePercent))
            : Math.round(lastPrice * (1 - entrySlippagePercent));

        // --- CRITICAL CHANGE: Add a limit price to the stop order ---
        // To make the stop-limit order behave like a stop-market, we add a slippage buffer.
        const stopSlippagePercent = 0.01; // 1% slippage buffer for the stop, should be wider
        const stopLimitPrice = (closeSide === 'sell') // Closing a LONG position
            ? Math.round(stopLoss * (1 - stopSlippagePercent)) // Sell stop: limit price is lower
            : Math.round(stopLoss * (1 + stopSlippagePercent)); // Buy stop: limit price is higher

        log.info(`Preparing to place ${signal} order for ${size} BTC of ${pair}`);

        try {
            const batchOrderPayload = {
                batchOrder: [
                    // 1. The Main Entry Order (Limit Order)
                    {
                        order: 'send',
                        order_tag: '1',
                        orderType: 'lmt',
                        symbol: pair,
                        side: entrySide,
                        size: size,
                        limitPrice: entryLimitPrice,
                    },
                    // 2. The Stop-Loss Order (NOW A STOP-LIMIT)
                    {
                        order: 'send',
                        order_tag: '2',
                        orderType: 'stp',
                        symbol: pair,
                        side: closeSide,
                        size: size,
                        stopPrice: stopLoss,
                        limitPrice: stopLimitPrice, // The required limit price for the stop
                        reduceOnly: true
                    },
                    // 3. The Take-Profit Order (Limit Order)
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

            log.info(`Sending corrected Batch Order (Stop-Limit) to Kraken: ${JSON.stringify(batchOrderPayload, null, 2)}`);

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
