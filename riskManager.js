import { log } from './logger.js';

export class RiskManager {
    constructor(config) {
        this.leverage = config.leverage || 10;
        this.marginBuffer = config.marginBuffer || 0.01;
        this.risk_per_trade_percent = 0.02; // Risk 2% of capital per trade
        log.info(`RiskManager (Chimera) initialized. Risk per trade: ${this.risk_per_trade_percent * 100}%`);
    }

    /**
     * Calculates ONLY the position size based on the AI's trade plan.
     * @param {number} balance - The current account balance.
     * @param {object} tradePlan - The full trade plan from the AI.
     * @returns {number|null} The calculated position size in units (e.g., BTC), or null if invalid.
     */
    calculatePositionSize(balance, tradePlan) {
        log.info('[RISK] Calculating position size for AI trade plan...');

        const { entry_price, stop_loss_price } = tradePlan;

        if (!balance || balance <= 0) {
            log.error('[RISK] Invalid account balance.');
            return null;
        }

        // 1. Calculate the risk per unit (the dollar amount lost if 1 unit hits the stop-loss)
        const riskPerUnit = Math.abs(entry_price - stop_loss_price);
        if (riskPerUnit <= 0) {
            log.warn('[RISK] AI provided an invalid entry/stop-loss pair. Risk is zero. Aborting.');
            return null;
        }

        // 2. Calculate the total capital we are willing to risk on this trade
        const totalCapitalToRisk = balance * this.risk_per_trade_percent;

        // 3. Calculate the position size in units (e.g., how much BTC to buy/sell)
        const sizeInUnits = totalCapitalToRisk / riskPerUnit;

        // 4. Sanity Check: Ensure we have enough margin for this position
        const positionValueUSD = sizeInUnits * entry_price;
        const marginRequired = (positionValueUSD / this.leverage) * (1 + this.marginBuffer);

        if (marginRequired > balance) {
            log.warn(`[RISK] Insufficient funds for calculated size. Required: $${marginRequired.toFixed(2)}, Available: $${balance.toFixed(2)}`);
            return null;
        }

        log.info(`[RISK] Calculated Position Size: ${sizeInUnits.toFixed(4)} units.`);
        return parseFloat(sizeInUnits.toFixed(4));
    }
}
