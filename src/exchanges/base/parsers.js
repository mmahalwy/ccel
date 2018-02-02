import omit from 'lodash/omit';
import sortBy from 'lodash/sortBy';
import { iso8601, milliseconds } from '../../utils/time';

export const getCurrencyUsedOnOpenOrders = (orders, currency) =>
  Object.values(orders)
    .filter(order => order.status === 'open')
    .reduce((total, order) => {
      const { symbol } = order;
      const market = this.markets[symbol];
      const amount = order.remaining;
      if (currency === market.base && order.side === 'sell') {
        return total + amount;
      } else if (currency === market.quote && order.side === 'buy') {
        return total + (order.cost || order.price * amount);
      }
      return total;
    }, 0);

export const parseBalance = (orders, balance) => {
  const currencies = Object.keys(omit(balance, 'info'));
  const scopedBalance = balance;

  currencies.forEach((currency) => {
    if (typeof balance[currency].used === 'undefined') {
      if (this.parseBalanceFromOpenOrders && 'open_orders' in balance.info) {
        const exchangeOrdersCount = balance.info.open_orders;
        const cachedOrdersCount = Object.values(orders).filter(order => order.status === 'open').length;

        if (cachedOrdersCount === exchangeOrdersCount) {
          scopedBalance[currency].used = getCurrencyUsedOnOpenOrders(
            orders,
            currency,
          );
          scopedBalance[currency].total =
            scopedBalance[currency].used + scopedBalance[currency].free;
        }
      } else {
        scopedBalance[currency].used = getCurrencyUsedOnOpenOrders(
          orders,
          currency,
        );
        scopedBalance[currency].total =
          scopedBalance[currency].used + scopedBalance[currency].free;
      }
    }

    ['free', 'used', 'total'].forEach((account) => {
      scopedBalance[account] = scopedBalance[account] || {};
      scopedBalance[account][currency] = scopedBalance[currency][account];
    });
  });

  return scopedBalance;
};

export const parseOHLCV = ohlcv => ohlcv;

export const parseOHLCVs = (
  ohlcvs,
  market = undefined,
  timeframe = '1m',
  since = undefined,
  limit = undefined,
) => {
  const ohlcvsValues = Object.values(ohlcvs);
  const result = [];

  ohlcvsValues.forEach((ohlcvsValue) => {
    if (limit && result.length >= limit) return null;

    const ohlcv = parseOHLCV(ohlcvsValue, market, timeframe, since, limit);

    if (since && ohlcv[0] < since) return null;

    return result.push(ohlcv);
  });

  return result;
};

export const filterBySinceLimit = (
  array,
  since = undefined,
  limit = undefined,
) => {
  let scopedArray = array;

  if (since) {
    scopedArray = array.filter(entry => entry.timestamp > since);
  }

  if (limit) {
    scopedArray = scopedArray.slice(0, limit);
  }

  return scopedArray;
};

export const parseBidAsk = (bidask, priceKey = 0, amountKey = 1) => {
  const price = parseFloat(bidask[priceKey]);
  const amount = parseFloat(bidask[amountKey]);
  return [price, amount];
};

export const parseBidsAsks = (bidasks, priceKey = 0, amountKey = 1) =>
  Object.values(bidasks || []).map(bidask =>
    parseBidAsk(bidask, priceKey, amountKey));

export const parseOrderBook = (
  orderbook,
  timestamp = milliseconds(),
  bidsKey = 'bids',
  asksKey = 'asks',
  priceKey = 0,
  amountKey = 1,
) => ({
  bids: sortBy(
    bidsKey in orderbook
      ? parseBidsAsks(orderbook[bidsKey], priceKey, amountKey)
      : [],
    0,
    true,
  ),
  asks: sortBy(
    asksKey in orderbook
      ? parseBidsAsks(orderbook[asksKey], priceKey, amountKey)
      : [],
    0,
  ),
  timestamp,
  datetime: iso8601(timestamp),
});

export const parseTrades = (trades, market, since, limit, parseTrade) => {
  let result = Object.values(trades).map(trade => parseTrade(trade, market));
  result = sortBy(result, 'timestamp', true);
  return filterBySinceLimit(result, since, limit);
};