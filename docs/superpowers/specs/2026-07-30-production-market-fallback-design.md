# Production Market Fallback Design

## Problem

The public page asks CoinGecko directly for BTC, ETH, and LINK prices before it asks the Worker for market data. A browser-level CoinGecko failure rejects `fetchMarketData()` immediately, so the page never reaches analysis generation and shows an empty error state even though the Worker market route is healthy.

## Design

`fetchMarketData()` will request direct CoinGecko prices and the Worker market payload independently.

- When direct CoinGecko prices are complete, they remain authoritative. Worker-derived support and resistance levels may supplement them, but degraded Worker spot quotes may not overwrite them.
- When direct CoinGecko fails, a complete Worker payload becomes the fallback source for prices and signals.
- When both sources fail or omit any of BTC, ETH, or LINK, the page fails explicitly rather than presenting incomplete or stale information.
- Existing fresh-only brief-cache rules remain unchanged.

## Verification

Behavioral tests will execute the real `fetchMarketData()` function with controlled external responses. One test protects direct-price precedence and one protects the Worker fallback. The full suite and the public deployment will then be verified.
