import { log } from './logger.js';

/**
 * @class BacktestExecutionHandler
 * @description Simulates order execution by logging trades instead of sending them to an API.
 */
export class BacktestExecutionHandler {
    constructor() {
        this.trades = []; // This will be our trade log
        log.info('[BACKTEST] Initialized BacktestExecutionHandler.');
    }

    /**
     * Simulates placing an order by recording it.
     * @param {object} tradeDetails - Contains all info about the hypothetical trade.
     */
    placeOrder({ signal, params, entryPrice, entryTime }) {
        const trade = {
            entryTime,
            entryPrice,
            signal,
            size: params.size,
            stopLoss: params.stopLoss,
            takeProfit: params.takeProfit,
            status: 'open', // The trade starts as 'open'
            exitTime: null,
            exitPrice: null,
            pnl: 0,
        };
        this.trades.push(trade);
        log.info(`[BACKTEST] ---- TRADE OPENED ----`);
        log.info(`[BACKTEST] Signal: ${signal} | Entry: ${entryPrice} | Time: ${new Date(entryTime * 1000).toISOString()}`);
        log.info(`[BACKTEST] SL: ${params.stopLoss} | TP: ${params.takeProfit}`);
    }

    getOpenTrade() {
        return this.trades.find(t => t.status === 'open');
    }
}
