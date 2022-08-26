const fs = require('fs');
const path = require('path');

const buildAirseekerConfig = () => ({
  airseekerWalletMnemonic: '${AIRSEEKER_WALLET_MNEMONIC}',
  log: {
    format: 'plain',
    level: 'DEBUG',
  },
  beacons: {
    '0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5': {
      airnode: '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      templateId: '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa',
      fetchInterval: 45,
    },
    '0xbf7ce55d109fd196de2a8bf1515d166c56c9decbe9cb473656bbca30d5743990': {
      airnode: '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      templateId: '0x0bbf5f2ec4b0e9faf5b89b4ddbed9bdad7a542cc258ffd7b106b523aeae039a6',
      fetchInterval: 45,
    },
  },
  beaconSets: {
    '0xf7f1620b7f422eb9a69c8e21b317ba1555d3d87e1d804f0b024f03b107e411e8': [
      '0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5',
      '0xbf7ce55d109fd196de2a8bf1515d166c56c9decbe9cb473656bbca30d5743990',
    ],
  },
  chains: {
    31337: {
      contracts: {
        DapiServer: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
      },
      providers: {
        local: {
          url: '${CP_LOCAL_URL}',
        },
      },
      options: {
        txType: 'legacy',
        fulfillmentGasLimit: 500_000,
        gasOracle: {
          maxTimeout: 1, // Set low to make tests run faster
          fallbackGasPrice: {
            value: 10,
            unit: 'gwei',
          },
          recommendedGasPriceMultiplier: 1,
          latestGasPriceOptions: {
            percentile: 60,
            minTransactionCount: 9,
            pastToCompareInBlocks: 20,
            maxDeviationMultiplier: 5, // Set high to ensure that txs do not use fallback
          },
        },
      },
    },
  },
  gateways: {
    '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace': [
      {
        apiKey: '${HTTP_GATEWAY_API_KEY}',
        url: '${HTTP_SIGNED_DATA_GATEWAY_URL}',
      },
    ],
  },
  templates: {
    '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa': {
      endpointId: '0x13dea3311fe0d6b84f4daeab831befbc49e19e6494c41e9e065a09c3c68f43b6',
      parameters:
        '0x3173737373730000000000000000000000000000000000000000000000000000746f00000000000000000000000000000000000000000000000000000000000055534400000000000000000000000000000000000000000000000000000000005f74797065000000000000000000000000000000000000000000000000000000696e7432353600000000000000000000000000000000000000000000000000005f70617468000000000000000000000000000000000000000000000000000000726573756c7400000000000000000000000000000000000000000000000000005f74696d65730000000000000000000000000000000000000000000000000000313030303030300000000000000000000000000000000000000000000000000066726f6d000000000000000000000000000000000000000000000000000000004554480000000000000000000000000000000000000000000000000000000000',
    },
    '0x0bbf5f2ec4b0e9faf5b89b4ddbed9bdad7a542cc258ffd7b106b523aeae039a6': {
      endpointId: '0x13dea3311fe0d6b84f4daeab831befbc49e19e6494c41e9e065a09c3c68f43b6',
      parameters:
        '0x3173737373730000000000000000000000000000000000000000000000000000746f00000000000000000000000000000000000000000000000000000000000055534400000000000000000000000000000000000000000000000000000000005f74797065000000000000000000000000000000000000000000000000000000696e7432353600000000000000000000000000000000000000000000000000005f70617468000000000000000000000000000000000000000000000000000000726573756c7400000000000000000000000000000000000000000000000000005f74696d65730000000000000000000000000000000000000000000000000000313030303030300000000000000000000000000000000000000000000000000066726f6d000000000000000000000000000000000000000000000000000000004254430000000000000000000000000000000000000000000000000000000000',
    },
  },
  triggers: {
    dataFeedUpdates: {
      31337: {
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
          beacons: [
            {
              beaconId: '0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5',
              deviationThreshold: 0.2,
              heartbeatInterval: 86400,
            },
            {
              beaconId: '0xbf7ce55d109fd196de2a8bf1515d166c56c9decbe9cb473656bbca30d5743990',
              deviationThreshold: 0.2,
              heartbeatInterval: 86400,
            },
          ],
          beaconSets: [
            {
              beaconSetId: '0xf7f1620b7f422eb9a69c8e21b317ba1555d3d87e1d804f0b024f03b107e411e8',
              deviationThreshold: 0.01,
              heartbeatInterval: 86400,
            },
          ],
          updateInterval: 50,
        },
      },
    },
  },
});

const buildLocalSecrets = () =>
  "AIRSEEKER_WALLET_MNEMONIC: 'achieve climb couple wait accident symbol spy blouse reduce foil echo label' \
  \nCP_LOCAL_URL: 'http://127.0.0.1:8545/' \
  \nHTTP_GATEWAY_API_KEY: 'some-api-key' \
  \nHTTP_SIGNED_DATA_GATEWAY_URL: 'http://localhost:5432/signed-data-gateway/'";

async function main() {
  const airseekerConfig = buildAirseekerConfig();
  fs.writeFileSync(path.join(__dirname, '..', 'config', 'airseeker.json'), JSON.stringify(airseekerConfig, null, 2));
  const airseekerSecrets = buildLocalSecrets();
  fs.writeFileSync(path.join(__dirname, '..', 'config', 'secrets.env'), airseekerSecrets);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
