import { main } from './main';
/**
 * This function is required to make the process block because loop promises are not returned/not hierarchical.
 * We need a separate function from main to keep Jest happy (without having a dedicated Jest check).
 */
export async function handler() {
  await main();

  await new Promise((_resolve) => {});
}
