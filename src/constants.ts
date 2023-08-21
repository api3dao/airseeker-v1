import { ethers } from 'ethers';

export const GATEWAY_TIMEOUT_MS = 15_000;
export const PROVIDER_TIMEOUT_MS = 15_000;
export const RANDOM_BACKOFF_MIN_MS = 0;
export const RANDOM_BACKOFF_MAX_MS = 2_500;
export const PRIORITY_FEE_IN_WEI = 3_120_000_000;
// The Base Fee to Max Fee multiplier
export const BASE_FEE_MULTIPLIER = 2;
// Solidity type(int224).min
export const INT224_MIN = ethers.BigNumber.from(2).pow(ethers.BigNumber.from(223)).mul(ethers.BigNumber.from(-1));
// Solidity type(int224).max
export const INT224_MAX = ethers.BigNumber.from(2).pow(ethers.BigNumber.from(223)).sub(ethers.BigNumber.from(1));
export const NO_DATA_FEEDS_EXIT_CODE = 1;
export const NO_FETCH_EXIT_CODE = 2;
// Number that represents 100% is chosen to avoid overflows in DapiServer's
// `calculateUpdateInPercentage()`. Since the reported data needs to fit
// into 224 bits, its multiplication by 10^8 is guaranteed not to overflow.
export const HUNDRED_PERCENT = 1e8;

// The difference between the socket timeout (used in axios utils) and the go-utils total timeout.
// This prevents dangling sockets which ultimately cause file descriptor exhaustion.
export const TOTAL_TIMEOUT_HEADROOM_DEFAULT_MS = 500;

// The difference between the socket timeout (used in ethers) and the go-utils total timeout.
// This prevents dangling sockets which ultimately cause file descriptor exhaustion.
export const PROVIDER_TIMEOUT_HEADROOM_DEFAULT_MS = 500;

// The maximum number of simultaneously running HTTP requests to ethers Providers
export const PROVIDER_MAX_CONCURRENCY_DEFAULT = 10;

// The minimum amount of time between HTTP calls to remote gateways per remote gateway.
// Example: 200 ms means a maximum of 5 requests per second
export const PROVIDER_MIN_TIME_DEFAULT_MS = 20;

// The maximum number of simultaneously-running HTTP requests per remote gateway.
export const GATEWAY_MAX_CONCURRENCY_DEFAULT = 10;

// The minimum amount of time between HTTP calls to remote gateways per remote gateway.
export const GATEWAY_MIN_TIME_DEFAULT_MS = 20;

// The minimum amount of time between HTTP calls to remote APIs per OIS.
export const DIRECT_GATEWAY_MIN_TIME_DEFAULT_MS = 20;

// The maximum number of simultaneously-running HTTP requests to remote APIs per OIS.
export const DIRECT_GATEWAY_MAX_CONCURRENCY_DEFAULT = 10;

// TODO: load these 2 from env var instead
export const DATAFEED_READ_BATCH_SIZE = 100;
export const DATAFEED_UPDATE_BATCH_SIZE = 10;
