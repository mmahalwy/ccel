import BaseExchange from '../../../src/exchanges/base/BaseExchange';

describe('BaseExchange', () => {
  describe('params', () => {
    class MyExchange extends BaseExchange {
      static API = {
        public: { get: ['url/one'] },
      };

      static URLS = {
        logo: 'logo',
        api: {
          public: 'https://api.exchange.com',
          private: 'https://api.exchange.com',
          kitchen: 'https://kitchen.exchange.com',
        },
      };

      static REQUIRED_CREDENTIALS = ['apiKey', 'apiSecret'];
      static SIGNED_APIS = [];
      static Parser = Object;
    }

    test('should error when passing incomplete required params', () => {
      expect(() => new MyExchange({ apiKey: 'apiKey' })).toThrowError();
    });

    test('should not error when passing complete required params', () => {
      expect(() => new MyExchange({ apiKey: 'apiKey', apiSecret: 'apiSecret' })).not.toThrowError();
    });
  });

  describe('api METHODS', () => {
    test('should set api METHODS', () => {
      class MyExchange extends BaseExchange {
        static API = {
          public: { get: ['url/one'] },
          private: { get: ['url/one'] },
          kitchen: { get: ['url/one'] },
        };

        static URLS = {
          logo: 'logo',
          api: {
            public: 'https://api.exchange.com',
            private: 'https://api.exchange.com',
            kitchen: 'https://kitchen.exchange.com',
          },
        };
        static SIGNED_APIS = [];
        static Parser = Object;
      }

      const instance = new MyExchange();

      expect(instance.api).toBeTruthy();
      expect(instance.api.public).toBeTruthy();
      expect(instance.api.public.get.urlOne).toBeTruthy();
      expect(instance.api.private).toBeTruthy();
      expect(instance.api.private.get.urlOne).toBeTruthy();
      expect(instance.api.kitchen).toBeTruthy();
      expect(instance.api.kitchen.get.urlOne).toBeTruthy();
    });

    test.only('should call signedRequest when private', () => {
      class MyExchange extends BaseExchange {
        static API = {
          public: { get: ['url/one'] },
          private: { get: ['url/one'] },
          kitchen: { get: ['url/one'] },
        };

        static URLS = {
          logo: 'logo',
          api: {
            public: 'https://api.exchange.com',
            private: 'https://api.exchange.com',
            kitchen: 'https://kitchen.exchange.com',
          },
        };

        static SIGNED_APIS = ['private'];
        static Parser = Object;

        getHeaders() {
          return { key: this.apiKey };
        }
      }

      const instance = new MyExchange();
      const signedRequestStub = jest.fn();

      instance.signedRequest = signedRequestStub;
      instance.api.private.get.urlOne();

      expect(signedRequestStub).toHaveBeenCalled();
    });

    test('should call request when not private', () => {
      class MyExchange extends BaseExchange {
        static API = {
          public: { get: ['url/one'] },
          private: { get: ['url/one'] },
          kitchen: { get: ['url/one'] },
        };

        static URLS = {
          logo: 'logo',
          api: {
            public: 'https://api.exchange.com',
            private: 'https://api.exchange.com',
            kitchen: 'https://kitchen.exchange.com',
          },
        };
        static SIGNED_APIS = ['private'];
        static Parser = Object;

        getHeaders() {
          return { key: this.apiKey };
        }
      }

      const instance = new MyExchange();
      const requestStub = jest.fn();

      instance.request = requestStub;
      instance.api.public.get.urlOne();

      expect(requestStub).toHaveBeenCalled();
    });
  });
});
