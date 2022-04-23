// Taken from @api3/airnode-utils so custom retry & timeout options can be used

import * as node from '@api3/airnode-node';
import { go, GoAsyncOptions } from '@api3/promise-utils';
import { BigNumber, ethers } from 'ethers';
import { getState, Provider } from './state';
import { PRIORITY_FEE_IN_WEI, BASE_FEE_MULTIPLIER } from './constants';
import { logger } from './logging';

type LegacyGasTarget = {
  txType: 'legacy';
  gasPrice: BigNumber;
};

type EIP1559GasTarget = {
  txType: 'eip1559';
  maxPriorityFeePerGas: BigNumber;
  maxFeePerGas: BigNumber;
};

export type GasTarget = LegacyGasTarget | EIP1559GasTarget;

export const parsePriorityFee = ({ value, unit }: node.PriorityFee) =>
  ethers.utils.parseUnits(value.toString(), unit ?? 'wei');

export const getLegacyGasPrice = async (
  provider: Provider,
  goOptions: GoAsyncOptions
): Promise<LegacyGasTarget | null> => {
  const goGasPrice = await go(() => provider.rpcProvider.getGasPrice(), goOptions);
  if (!goGasPrice.success) {
    logger.log(`Unable to get legacy gas price for chain with ID ${provider.chainId}. Error: ${goGasPrice.error}`);
    return null;
  }

  return { txType: 'legacy', gasPrice: goGasPrice.data };
};

export const getEip1559GasPricing = async (
  provider: Provider,
  chainOptions: node.ChainOptions,
  goOptions: GoAsyncOptions
): Promise<EIP1559GasTarget | null> => {
  const goBlock = await go(() => provider.rpcProvider.getBlock('latest'), goOptions);
  if (!goBlock.success) {
    logger.log(`Unable to get EIP-1559 gas pricing from chain with ID ${provider.chainId}. Error: ${goBlock.error}`);
    return null;
  }
  if (!goBlock.data.baseFeePerGas) {
    logger.log(`Unable to get base fee per gas from chain with ID ${provider.chainId}.`);
    return null;
  }

  const block = goBlock.data;
  const maxPriorityFeePerGas = chainOptions.priorityFee
    ? parsePriorityFee(chainOptions.priorityFee)
    : BigNumber.from(PRIORITY_FEE_IN_WEI);
  const baseFeeMultiplier = chainOptions.baseFeeMultiplier ? chainOptions.baseFeeMultiplier : BASE_FEE_MULTIPLIER;
  const maxFeePerGas = block.baseFeePerGas!.mul(BigNumber.from(baseFeeMultiplier)).add(maxPriorityFeePerGas!);

  return { txType: 'eip1559', maxPriorityFeePerGas, maxFeePerGas };
};

export const getGasPrice = async (provider: Provider, goOptions: GoAsyncOptions): Promise<GasTarget | null> => {
  const chainOptions = getState().config.chains[provider.chainId].options;
  let gasTarget: GasTarget | null;
  switch (chainOptions.txType) {
    case 'legacy':
      gasTarget = await getLegacyGasPrice(provider, goOptions);
      break;
    case 'eip1559':
      gasTarget = await getEip1559GasPricing(provider, chainOptions, goOptions);
      break;
  }

  if (!gasTarget) return gasTarget;

  let gasTargetMessage;
  if (gasTarget.txType === 'eip1559') {
    const gweiMaxFee = node.evm.weiToGwei(gasTarget.maxFeePerGas!);
    const gweiPriorityFee = node.evm.weiToGwei(gasTarget.maxPriorityFeePerGas!);
    gasTargetMessage = `Gas price (EIP-1559) set to a Max Fee of ${gweiMaxFee} Gwei and a Priority Fee of ${gweiPriorityFee} Gwei`;
  } else {
    const gweiPrice = node.evm.weiToGwei(gasTarget.gasPrice!);
    gasTargetMessage = `Gas price (legacy) set to ${gweiPrice} Gwei`;
  }
  logger.log(gasTargetMessage);

  return gasTarget;
};
