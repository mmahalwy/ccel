import get from 'lodash/get';

import BaseParser from '../base/BaseParser';
import { BASE_ASSETS, NON_BTC_TAKER } from './constants';
import { ORDER_TYPES, MARKET_STATUS, MAKER, TAKER } from '../../constants';
import { iso8601 as iso8601Fn, parse8601 } from '../../utils/time';
import { precisionFromString } from '../../utils/number';

class GdaxParser extends BaseParser {
  parseTrade = (trade, market, marketsById) => {
    const timestamp = trade.time
      ? parse8601(trade.time)
      : parse8601(trade.created_at);
    const iso8601 = timestamp && iso8601Fn(timestamp);
    const side = trade.side === ORDER_TYPES.LOWER.BUY
      ? ORDER_TYPES.LOWER.SELL
      : ORDER_TYPES.LOWER.BUY;
    const feeCost = parseFloat(get(trade, 'fill_fees', trade.fee));

    let feeRate;
    let feeCurrency;
    let symbol;
    let type;

    if (!market) {
      if (trade.product_id) {
        const marketId = trade.product_id;

        if (marketsById[marketId]) {
          // eslint-disable-next-line no-param-reassign
          market = marketsById[marketId];
        }
      }
    }

    if (market) {
      // eslint-disable-next-line prefer-destructuring
      symbol = market.symbol;
    }

    if (market) {
      feeCurrency = market.quote;

      if (trade.liquidity) {
        const rateType = trade.liquidity === 'T' ? TAKER : MAKER;

        feeRate = market[rateType];
      }
    }

    const fee = {
      cost: feeCost,
      currency: feeCurrency,
      rate: feeRate,
    };

    const id = get(trade, 'trade_id');
    const orderId = get(trade, 'order_id');

    return {
      id,
      order: orderId,
      ...this.infoField(trade),
      timestamp,
      datetime: iso8601,
      symbol,
      type,
      side,
      price: parseFloat(trade.price),
      amount: parseFloat(trade.size),
      fee,
    };
  };

  parseOHLCV = ohlcv => [
    ohlcv[0] * 1000,
    ohlcv[3],
    ohlcv[2],
    ohlcv[1],
    ohlcv[4],
    ohlcv[5],
  ];

  parseOrderStatus = (status) => {
    const statuses = {
      pending: 'open',
      active: 'open',
      open: 'open',
      done: 'closed',
      canceled: 'canceled',
    };

    return get(statuses, status);
  };

  parseOrder = (order, _market) => {
    let market = _market;

    if (!market) {
      if (this.exchange.marketsById[order.product_id]) {
        market = this.exchange.marketsById[order.product_id];
      }
    }

    const symbol = market && market.symbol;
    const timestamp = parse8601(order.created_at);
    const status = this.parseOrderStatus(order.status);
    const price = parseFloat(get(order, 'price'));
    const amount = parseFloat(get(order, 'size') || get(order, 'funds') || get(order, 'specified_funds'));
    const filled = parseFloat(get(order, 'filled_size'));
    const cost = parseFloat(get(order, 'executed_value'));
    const fee = {
      cost: parseFloat(get(order, 'fill_fees')),
      currency: undefined,
      rate: undefined,
    };

    let remaining;

    if (amount) {
      if (filled) {
        remaining = amount - filled;
      }
    }

    return {
      id: order.id,
      ...this.infoField(order),
      timestamp,
      datetime: iso8601Fn(timestamp),
      status,
      symbol,
      type: order.type,
      side: order.side,
      price,
      cost,
      amount,
      filled,
      remaining,
      fee,
    };
  };

  parseBalances(balances) {
    const result = { ...this.infoField(balances) };

    balances.forEach((balance) => {
      const { currency } = balance;
      const account = {
        free: parseFloat(balance.available),
        used: parseFloat(balance.hold),
        total: parseFloat(balance.balance),
      };

      result[currency] = account;
    });

    return this.parseBalance(result);
  }

  parseTicker(ticker, symbol) {
    const timestamp = ticker.time && parse8601(ticker.time);
    const datetime = timestamp && iso8601Fn(timestamp);
    const bid = ticker.bid ? parseFloat(ticker.bid) : null;
    const ask = ticker.ask ? parseFloat(ticker.ask) : null;

    return {
      symbol,
      timestamp,
      datetime,
      high: undefined,
      low: undefined,
      bid,
      bidVolume: undefined,
      ask,
      askVolume: undefined,
      vwap: undefined,
      open: undefined,
      close: undefined,
      first: undefined,
      last: parseFloat(ticker.price),
      change: undefined,
      percentage: undefined,
      average: undefined,
      baseVolume: parseFloat(ticker.volume),
      quoteVolume: undefined,
      ...this.infoField(ticker),
    };
  }

  parseMarkets = (markets) => {
    const result = [];
    const { trading } = this.exchange.constructor.FEES;

    markets.forEach((market) => {
      const { id, base_currency: base, quote_currency: quote } = market;
      const symbol = `${base}/${quote}`;
      const priceLimits = {
        min: market.quote_increment && parseFloat(market.quote_increment),
        max: undefined,
      };
      const precision = {
        amount: 8,
        price: market.quote_increment &&
          precisionFromString(market.quote_increment),
      };

      let { taker } = trading;

      if (base === BASE_ASSETS.ETH || base === BASE_ASSETS.LTC) {
        taker = NON_BTC_TAKER;
      }

      const active = market.status === MARKET_STATUS.LOWER.ONLINE;

      result.push({
        ...trading,
        id,
        symbol,
        base,
        quote,
        precision,
        limits: {
          amount: {
            min: market.base_min_size && parseFloat(market.base_min_size),
            max: market.base_max_size && parseFloat(market.base_max_size),
          },
          price: priceLimits,
          cost: {
            min: market.min_market_funds && parseFloat(market.min_market_funds),
            max: market.max_market_funds && parseFloat(market.max_market_funds),
          },
        },
        taker,
        active,
        ...this.infoField(market),
      });
    });

    return result;
  };
}

export default GdaxParser;
