-- Use "CREATE TABLE IF NOT EXISTS" to prevent errors on subsequent runs
CREATE TABLE IF NOT EXISTS candles_1h (
    timestamp BIGINT PRIMARY KEY,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume NUMERIC
);

CREATE TABLE IF NOT EXISTS candles_15m (
    timestamp BIGINT PRIMARY KEY,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume NUMERIC
);
