const ALCAMBIO_GQL_ENDPOINT = 'https://api.alcambio.app/graphql';

export interface ExchangeRateData {
  bcv: number;
  parallel: number;
  lastUpdate: string;
}

const BCV_QUERY = `
query getCountryConversions($countryCode: String!) {
  getCountryConversions(
    payload: {countryCode: $countryCode}
  ) {
    conversionRates {
      baseValue
      official
      type
      rateCurrency {
        code
      }
    }
    dateBcv
  }
}
`;

const PARALLEL_QUERY = `
query getBinanceP2PAverages {
  getBinanceP2PAverages {
    sellAverage
    buyAverage
    asset
    updatedAt
  }
}
`;

class ExchangeRateService {
  async fetchRates(): Promise<ExchangeRateData> {
    try {
      // Fetch BCV
      const bcvResponse = await fetch(ALCAMBIO_GQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: BCV_QUERY,
          variables: { countryCode: 'VE' }
        })
      });
      const bcvData = await bcvResponse.json();
      const bcvRate = bcvData?.data?.getCountryConversions?.conversionRates?.find(
        (r: any) => r.official && r.rateCurrency.code === 'USD'
      )?.baseValue || 36.50; // Fallback

      // Fetch Parallel (USDT)
      const parallelResponse = await fetch(ALCAMBIO_GQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: PARALLEL_QUERY
        })
      });
      const parallelData = await parallelResponse.json();
      const parallelRate = parallelData?.data?.getBinanceP2PAverages?.sellAverage || bcvRate * 1.15;

      return {
        bcv: bcvRate,
        parallel: parallelRate,
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error fetching exchange rates from AlCambio:', error);
      // Return default values in case of CORS or connectivity issues
      return {
        bcv: 36.60,
        parallel: 42.50,
        lastUpdate: new Date().toISOString()
      };
    }
  }
}

export const exchangeRateService = new ExchangeRateService();
