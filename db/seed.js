import { log } from '../logger.js';
import db from './client.js'; // Our new DB client
import axios from 'axios';

const BATCH_SIZE = 1000;
const START_DATE = '2022-01-01T00:00:00Z';

// Helper function to fetch data from Binance (we can move this to a dedicated fetcher module later)
async function fetchBinanceOHLC(symbol, interval, startTime, limit) {
    const url = 'https://api.binance.com/api/v3/klines';
    const params = { symbol, interval, startTime, limit };
    const response = await axios.get(url, { params });
    return response.data.map(kline => ({
        timestamp: Math.floor(kline[0] / 1000),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
    }));
}

// Function to insert a batch of candles into the database
async function insertCandles(client, tableName, candles) {
    const values = candles.map(c => `(${c.timestamp}, ${c.open}, ${c.high}, ${c.low}, ${c.close}, ${c.volume})`).join(',');
    // "ON CONFLICT DO NOTHING" prevents errors if we try to insert a timestamp that already exists
    const query = `INSERT INTO ${tableName} (timestamp, open, high, low, close, volume) VALUES ${values} ON CONFLICT (timestamp) DO NOTHING;`;
    await client.query(query);
}

// Main function to seed a specific table
async function seedTable({ pair, interval, tableName }) {
    log.info(`--- Seeding ${tableName} for ${pair} ${interval} ---`);
    
    const client = await db.getClient();
    try {
        await client.query('BEGIN'); // Start a transaction

        let startTime = new Date(START_DATE).getTime();
        const endTime = Date.now();
        let totalCandlesInserted = 0;

        while (startTime < endTime) {
            log.info(`[SEEDER] Fetching ${pair} ${interval} data from ${new Date(startTime).toISOString()}...`);
            const candles = await fetchBinanceOHLC(pair, interval, startTime, BATCH_SIZE);
            if (candles.length === 0) break;

            await insertCandles(client, tableName, candles);
            totalCandlesInserted += candles.length;

            startTime = candles[candles.length - 1].timestamp * 1000 + 1;
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        await client.query('COMMIT'); // Commit the transaction
        log.info(`--- Seeding for ${tableName} complete. Total candles processed: ${totalCandlesInserted}. ---`);
    } catch (error) {
        await client.query('ROLLBACK'); // Rollback on error
        log.error(`Error seeding ${tableName}. Transaction rolled back.`, error);
    } finally {
        client.release(); // Release the client back to the pool
    }
}

// The main execution block
async function runSeeder() {
    log.info('--- Starting Database Seeding Process ---');
    
    // First, create the tables if they don't exist
    // (You would run your schema.sql script once manually or create a function for it)
    
    await seedTable({ pair: 'BTCUSDT', interval: '1h', tableName: 'candles_1h' });
    await seedTable({ pair: 'BTCUSDT', interval: '15m', tableName: 'candles_15m' });
    
    log.info('--- Database Seeding Process Finished ---');
    // We need to manually exit because the DB pool keeps the script alive
    process.exit(0);
}

runSeeder();
