import { SignedData } from '../src/validation';

// Airkeeper with signed data gateway enabled deployed on API3 account which can be used for testing.
export const signedDataCoingeckoAirnode = {
  apiKey: '3467278462378946893264794867392864828947',
  url: 'https://57sv91sb73.execute-api.us-east-1.amazonaws.com/v1/',
  endpointId: '0xfb87102cdabadf905321521ba0b3cbf74ad09c5d400ac2eccdbef8d6143e78c4',
  parameters:
    '0x3173000000000000000000000000000000000000000000000000000000000000636f696e49640000000000000000000000000000000000000000000000000000626974636f696e00000000000000000000000000000000000000000000000000',
};

export const validSignedData: SignedData = {
  data: {
    timestamp: '1649664085',
    value: '0x00000000000000000000000000000000000000000000000000000009dc41b780',
  },
  signature:
    '0x8aace553ec28f53cc976c8a2469d50f16de121d248495117aca36feb4950957827570e0648f82bdbc0afa6cb69dd9fe37dc7f9d58ae3aa06450e627e06c1b8031b',
};
