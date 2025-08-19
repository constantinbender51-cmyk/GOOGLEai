CREATE TABLE candles_1h (
    timestamp BIGINT PRIMARY KEY,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume NUMERIC
);

CREATE TABLE candles_15m (
    timestamp BIGINT PRIMARY KEY,
    open NUMERIC,
    high NUMERIC,
    low NUMERIC,
    close NUMERIC,
    volume NUMERIC
);
-- We can add more tables here later
