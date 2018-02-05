import crypto from 'crypto';
import get from 'lodash/get';
import qs from 'qs';

import BaseExchange from '../base/BaseExchange';
import ExchangeError from '../base/errors/ExchangeError';

import { milliseconds } from '../../utils/time';
import {
  REQUIRED_CREDENTIALS,
  URLS,
  FEES,
  API,
  SIGNED_APIS,
  TAKER,
  ORDER_TYPE,
  TIME_IN_FORCE,
} from './constants';
import BinanceParser from './BinanceParser';

class Binance extends BaseExchange {
  static Parser = BinanceParser;
  static REQUIRED_CREDENTIALS = REQUIRED_CREDENTIALS;
  static URLS = URLS;
  static FEES = FEES;
  static API = API;
  static SIGNED_APIS = SIGNED_APIS;

  getSignature({ params, timestamp }) {
    const strForSign = qs.stringify({
      ...params,
      timestamp,
    });
    const signatureResult = crypto
      .createHmac('sha256', this.apiSecret)
      .update(strForSign)
      .digest('hex');

    return signatureResult;
  }

  sign({ path, params, nonce }) {
    return {
      params: {
        ...params,
        timestamp: nonce,
        signature: this.getSignature({
          path,
          params,
          timestamp: nonce,
        }),
      },
      headers: {
        'X-MBX-APIKEY': this.apiKey,
      },
    };
  }

  async loadTimeDifference() {
    const before = milliseconds();
    const response = await this.api.public.get.time();
    const after = milliseconds();

    const sumOfDiff = before + after;
    const averageOfDiff = sumOfDiff / 2;

    this.timeDifference = averageOfDiff - response.serverTime;

    return this.timeDifference;
  }

  async fetchMarkets() {
    const response = await this.api.public.get.exchangeInfo();

    if (this.adjustForTimeDifference) {
      await this.loadTimeDifference();
    }

    const markets = response.symbols;

    return this.parser.parseMarkets(markets);
  }

  calculateFee(symbol, type, side, amount, price, takerOrMaker = TAKER) {
    let key = 'quote';
    const market = this.markets[symbol];
    const rate = market[takerOrMaker];

    let cost = parseFloat(this.costToPrecision(symbol, amount * rate));

    if (side === ORDER_TYPE.SELL) {
      cost *= price;
    } else {
      key = 'base';
    }

    return {
      type: takerOrMaker,
      currency: market[key],
      rate,
      cost: parseFloat(this.feeToPrecision(symbol, cost)),
    };
  }

  async fetchBalance(params = {}) {
    await this.loadMarkets();

    const response = await this.api.private.get.account({ params });
    return this.parser.parserBalances(response);
  }

  async fetchOrderBook(symbol, params = {}) {
    await this.loadMarkets();

    const market = this.market(symbol);
    const orderbook = await this.api.public.get.depth({
      symbol: market.id,
      limit: 100, // default = maximum = 100
      ...params,
    });

    return this.parser.parseOrderBook(orderbook);
  }

  async fetchTicker(symbol, params = {}) {
    await this.loadMarkets();

    const market = this.market(symbol);
    const response = await this.api.public.get.ticker24Hr({
      symbol: market.id,
      params,
    });

    return this.parser.parseTicker(response, market, this.marketsById);
  }

  async fetchBidAsks(symbols, params = {}) {
    await this.loadMarkets();
    const rawTickers = await this.api.public.get.tickerBookTicker({ params });

    return this.parser.parseTickers(rawTickers, symbols);
  }

  async fetchTickers(symbols, params = {}) {
    await this.loadMarkets();
    const rawTickers = await this.api.public.get.ticker24Hr({ params });

    return this.parser.parseTickers(rawTickers, symbols);
  }

  async fetchOHLCV(symbol, timeframe = '1m', since, limit, params = {}) {
    await this.loadMarkets();

    const market = this.market(symbol);
    const setupParams = {
      interval: this.timeframes[timeframe],
    };

    setupParams.limit = limit || 500; // default == max == 500

    if (since) {
      setupParams.startTime = since;
    }

    const response = await this.api.public.get.klines({
      symbol: market.id,
      params: { ...setupParams, ...params },
    });

    return this.parser.parseOHLCVs(response, market, timeframe, since, limit);
  }

  async fetchTrades(symbol, since, limit, params = {}) {
    await this.loadMarkets();
    const market = this.market(symbol);
    const setupParams = {};

    if (since) {
      setupParams.startTime = since;
      setupParams.endTime = since + 3600000;
    }

    if (limit) {
      setupParams.limit = limit;
    }
    // 'fromId': 123,    // ID to get aggregate trades from INCLUSIVE.
    // 'startTime': 456, // Timestamp in ms to get aggregate trades from INCLUSIVE.
    // 'endTime': 789,   // Timestamp in ms to get aggregate trades until INCLUSIVE.
    // 'limit': 500,     // default = maximum = 500
    const response = await this.api.public.get.aggTrades({
      symbol: market.id,
      params: {
        ...setupParams,
        ...params,
      },
    });

    return this.parser.parseTrades(response, market, since, limit);
  }

  async createOrder(symbol, type, side, amount, price, data = {}) {
    await this.loadMarkets();
    const market = this.market(symbol);

    const order = {
      symbol: market.id,
      quantity: this.amountToString(symbol, amount),
      type: type.toUpperCase(),
      side: side.toUpperCase(),
    };

    if (type === ORDER_TYPE.LIMIT) {
      order.price = this.priceToPrecision(symbol, price);
      order.timeInForce = TIME_IN_FORCE.GTC;
    }

    const response = await this.api.private.post.order({
      data: {
        ...order,
        ...data,
      },
    });

    return this.parser.parseOrder(response, this.marketsById);
  }

  async fetchOrder(id, symbol, params = {}) {
    if (!symbol) {
      throw new ExchangeError('Binance fetchOrder requires a symbol param');
    }

    await this.loadMarkets();

    const market = this.market(symbol);
    const response = await this.api.private.get.order({
      symbol: market.id,
      orderId: parseInt(id, 10),
      params,
    });

    return this.parser.parseOrder(response, market);
  }

  async fetchOrders(symbol, since, limit, params = {}) {
    if (!symbol) {
      throw new ExchangeError('Binance fetchOrders requires a symbol param');
    }

    await this.loadMarkets();

    const market = this.market(symbol);

    const response = await this.api.private.get.allOrders({
      symbol: market.id,
      params: {
        limit,
        ...params,
      },
    });

    return this.parser.parseOrders(response, market, since, limit);
  }

  async fetchOpenOrders(symbol, since, limit, params = {}) {
    if (!symbol) {
      throw new ExchangeError('Binance fetchOpenOrders requires a symbol param');
    }

    await this.loadMarkets();

    let market;
    const setupParams = {};

    if (symbol) {
      market = this.market(symbol);
      setupParams.symbol = market.id;
    }

    const response = await this.api.private.get.openOrders({ ...setupParams, params });

    return this.parser.parseOrders(response, market, since, limit);
  }

  async fetchMyTrades(symbol, since, limit, params = {}) {
    if (!symbol) {
      throw new ExchangeError('Binance fetchMyTrades requires a symbol argument');
    }

    await this.loadMarkets();

    const market = this.market(symbol);

    const response = await this.api.private.get.myTrades({
      symbol: market.id,
      params: {
        limit,
        ...params,
      },
    });

    return this.parser.parseTrades(response, market, since, limit);
  }

  async withdraw(currency, amount, address, tag, data = {}) {
    const name = address.slice(0, 20);
    const request = {
      asset: this.currencyId(currency),
      address,
      amount: parseFloat(amount),
      name,
    };

    if (tag) {
      request.addressTag = tag;
    }

    const response = await this.api.wapi.post.withdraw({
      data: {
        ...request,
        ...data,
      },
    });

    return {
      ...this.parser.infoField(response),
      id: get(response, 'id'),
    };
  }

  async fetchDepositAddress(currency, params = {}) {
    const response = await this.api.wapi.get.depositAddress({
      asset: this.parser.currencyId(currency),
      ...params,
    });

    if (response.success) {
      const address = get(response, 'address');
      const tag = get(response, 'addressTag');

      return {
        currency,
        address,
        tag,
        status: 'ok',
        ...this.parser.infoField(response),
      };
    }

    throw new ExchangeError(`Binance fetchDepositAddress failed: ${this.last_http_response}`);
  }
}

export default Binance;
