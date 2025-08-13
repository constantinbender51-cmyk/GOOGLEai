// executionHandler.js

/**
 * @class ExecutionHandler
 * @description Handles the placement of orders on the exchange.
 */
export class ExecutionHandler {
    /**
     * @param {object} api - An instance of the KrakenFuturesApi client.
     */
    constructor(api) {
        if (!api) {
            throw new Error("ExecutionHandler requires an instance of the KrakenFuturesApi client.");
        }
        this.api = api;
        console.log("ExecutionHandler initialized.");
    }

    /**
     * Places a complete trade (entry, stop-loss, and take-profit) on the exchange.
     * 
     * @param {object} tradeDetails - The details of the trade to be executed.
     * @param {string} tradeDetails.signal - The trading signal ('LONG' or 'SHORT').
     * @param {string} tradeDetails.pair - The trading pair symbol (e.g., 'PI_XBTUSD').
     * @param {object} tradeDetails.params - The parameters from the RiskManager.
     * @param {number} tradeDetails.params.size - The size of the order.
     * @param {number} tradeDetails.params.stopLoss - The stop-loss price.
     * @param {number} tradeDetails.params.takeProfit - The take-profit price.
     * @returns {Promise<object>} The API response from the batch order placement.
     */
    async placeOrder({ signal, pair, params }) {
        const { size, stopLoss, takeProfit } = params;

        if (!['LONG', 'SHORT'].includes(signal) || !pair || !size || !stopLoss || !takeProfit) {
            throw new Error("Invalid trade details provided to ExecutionHandler.");
        }

        // Determine the direction for the entry order
        const entrySide = (signal === 'LONG') ? 'buy' : 'sell';
        // The side for the closing orders (stop-loss/take-profit) is opposite to the entry
        const closeSide = (signal === 'LONG') ? 'sell' : 'buy';

        console.log(`--- Preparing to place ${signal} order for ${size} contracts of ${pair} ---`);

        try {
            //TRST_RUN: START 
            const testBatch = {
                batchOrder: [
    {
      order: 'send',
      order_tag: '1',
      orderType: 'lmt',
      symbol: 'PF_XBTUSD',
      side: 'buy',
      size: 0.0007,
      limitPrice: 1.0,
      cliOrdId: 'my_another_client_id',
    },
    {
      order: 'send',
      order_tag: '2',
      orderType: 'stp',
      symbol: 'PF_XBTUSD',
      side: 'buy',
      size: 0.0007,
      limitPrice: 2.0,
      stopPrice: 3.0,
    }
                 ],
              };
            console.log("Sending Test Order to Kraken:", JSON.stringify(testBatch, null, 2));
            
            const testResponse = await this.api.batchOrder({ json: JSON.stringify(testBatch) });
            console.log("--- Test Batch Order Response Received ---");
            console.log(JSON.stringify(testResponse, null, 2));
            
            //TEST_RUN: FINISH 
            // Kraken Futures allows sending multiple orders in a single request using 'batchorder'.
            // This is the most robust way to place an entry with its corresponding SL/TP orders.
            const batchOrderPayload = {
                element: 'batch',
                orders: [
                    // 1. The Main Entry Order (Market Order)
                    {
                        order: 'send',
                        order_tag: '1', // Tag for identification
                        orderType: 'mkt', // Market order for immediate execution
                        symbol: pair,
                        side: entrySide,
                        size: size,
                    },
                    // 2. The Stop-Loss Order
                    {
                        order: 'send',
                        order_tag: '2',
                        orderType: 'stp', // Stop order
                        symbol: pair,
                        side: closeSide,
                        size: size,
                        stopPrice: stopLoss,
                        // 'reduceOnly' ensures this order only closes a position, not opens a new one
                        reduceOnly: true 
                    },
                    // 3. The Take-Profit Order
                    {
                        order: 'send',
                        order_tag: '3',
                        orderType: 'lmt', // Limit order
                        symbol: pair,
                        side: closeSide,
                        size: size,
                        limitPrice: takeProfit,
                        reduceOnly: true
                    }
                ]
            };

            console.log("Sending Batch Order to Kraken:", JSON.stringify(batchOrderPayload, null, 2));

            // Use the batchOrder method from our API client
            const response = await this.api.batchOrder({ json: JSON.stringify(batchOrderPayload) });

            console.log("--- Batch Order Response Received ---");
            console.log(JSON.stringify(response, null, 2));

            if (response.result === 'success') {
                console.log("✅ Successfully placed batch order!");
            } else {
                console.error("❌ Failed to place batch order.", response);
            }

            return response;

        } catch (error) {
            console.error("❌ CRITICAL ERROR in ExecutionHandler:", error.message);
            throw error; // Re-throw the error to be caught by the main loop
        }
    }
}
