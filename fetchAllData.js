// fetchAllData.js (New File)

import { downloadAndSaveData } from './dataFetcher.js';
import { log } from './logger.js';

const PAIR = 'BTCUSDT';

// Define all the datasets we need for our new strategy
const datasets = [
    {
        interval: '1h',
        filePath: `./data/${PAIR}_1h_data.csv`
    },
    {
        interval: '15m',
        filePath: `./data/${PAIR}_15m_data.csv`
    },
    // We can easily add more here in the future (e.g., 4h, 1d)
];

async function main() {
    log.info('--- Starting Project Chimera Data Download ---');
    for (const dataset of datasets) {
        try {
            await downloadAndSaveData({
                pair: PAIR,
                interval: dataset.interval,
                filePath: dataset.filePath
            });
        } catch (error) {
            log.error(`Failed to process dataset for ${PAIR} ${dataset.interval}.`, error);
        }
    }
    log.info('--- All Data Downloads Attempted ---');
}

main();
