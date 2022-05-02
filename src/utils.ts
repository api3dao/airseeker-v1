export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const shortenAddress = (address: string) => address.replace(address.substring(5, 38), '...');
