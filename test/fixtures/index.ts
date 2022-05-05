import { SignedData } from '../../src/validation';

export const validSignedData: SignedData = {
  data: {
    timestamp: '1649664085',
    value: '0x00000000000000000000000000000000000000000000000000000009dc41b780',
  },
  signature:
    '0x8aace553ec28f53cc976c8a2469d50f16de121d248495117aca36feb4950957827570e0648f82bdbc0afa6cb69dd9fe37dc7f9d58ae3aa06450e627e06c1b8031b',
};

export const getUnixTimestamp = (dateString: string) => Math.floor(Date.parse(dateString) / 1000);
