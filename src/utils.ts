import { GoAsyncOptions } from '@api3/promise-utils';
import { INFINITE_RETRIES, RANDOM_BACKOFF_MAX_MS, RANDOM_BACKOFF_MIN_MS } from './constants';

export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const shortenAddress = (address: string) => address.replace(address.substring(5, 38), '...');

export const calculateTimeout = (startTime: number, totalTimeout: number) => totalTimeout - (Date.now() - startTime);

// We retry all chain operations with a random back-off infinitely until the next updates cycle
export const prepareGoOptions = (_startTime: number, _totalTimeout: number): GoAsyncOptions => ({
  retries: INFINITE_RETRIES,
  delay: { type: 'random' as const, minDelayMs: RANDOM_BACKOFF_MIN_MS, maxDelayMs: RANDOM_BACKOFF_MAX_MS },
});
