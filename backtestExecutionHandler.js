import { log } from './logger.js';

export class BacktestExecutionHandler {
    constructor(initialBalance) {
        this.balance = initialBalance;
        this.trades = [];
        log.info(`[BACKTEST] Initialized BacktestExecutionHandler with balance: $${this.balance}`);
    }

    placeOrder({ signal, params, entryPrice, entryTime, reason }) {
        // ... (logic is the same)
    }

    getOpenTrade() {
        return this.trades.find(t => t.status === 'open');
    }

    closeTrade(trade, exitPrice, exitTime) {
        const pnl = (exitPrice - trade.entryPrice) * trade.size * (trade.signal === 'LONG' ? 1 : -1);
        this.balance += pnl; // It now correctly updates its own balance
        trade.status = 'closed';
        trade.exitPrice = exitPrice;
        trade.exitTime = exitTime;
        trade.pnl = pnl;
        log.info(`[BACKTEST] ---- TRADE CLOSED ----`);
        log.info(`[BACKTEST] Exit: ${exitPrice} | P&L: $${pnl.toFixed(2)} | New Balance: $${this.balance.toFixed(2)}`);
    }

    getTrades() {
        return this.trades;
    }
}
