// executionHandler.js

import { log } from './logger.js';

/**
 * @class ExecutionHandler
 * @description Handles the placement of orders on the exchange, respecting the strict API parameter order.
 */
export class ExecutionHandler {
    constructor(api) {
        if (!api) {
            throw new Error("ExecutionHandler requires an instance of the KrakenFuturesApi client.");
        }
        this.api = api;
        log.info("ExecutionHandler initialized.");
    }

    async placeOrder({ signal, pair, params, lastPrice }) {
        const { size, stopLoss, takeProfit } = params;

        if (!['LONG', 'SHORT'].includes(signal) || !pair || !size || !stopLoss || !takeProfit || !lastPrice) {
            throw new Error("Invalid trade details provided to ExecutionHandler, lastPrice is required.");
        }

        const entrySide = (signal === 'LONG') ? 'buy' : 'sell';
        const closeSide = (signal === 'LONG') ? 'sell' : 'buy';

        const entrySlippagePercent = 0.001;
        const entryLimitPrice = (signal === 'LONG')
            ? Math.round(lastPrice * (1 + entrySlippagePercent))
            : Math.round(lastPrice * (1 - entrySlippagePercent));

        const stopSlippagePercent = 0.01;
        const stopLimitPrice = (closeSide === 'sell')
            ? Math.round(stopLoss * (1 - stopSlippagePercent))
            : Math.round(stopLoss * (1 + stopSlippagePercent));

        log.info(`Preparing to place ${signal} order for ${size} BTC of ${pair}`);

        try {
            // --- FINAL CORRECTION: Construct the stop-loss order with the exact documented key order ---
            const stopLossOrder = {
                order: 'send',
                order_tag: '2',
                orderType: 'stp',
                symbol: pair,
                side: closeSide,
                size: size,
                // Enforce the documented order: limitPrice first, then stopPrice.
                limitPrice: stopLimitPrice,
                stopPrice: stopLoss,
                reduceOnly: true
            };

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
                    // 2. The Stop-Loss Order (with correct, enforced key order)
                    stopLossOrder,
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

            log.info(`Sending Final Corrected Batch Order to Kraken: ${JSON.stringify(batchOrderPayload, null, 2)}`);

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
