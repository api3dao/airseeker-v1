// Taken from @api3/airnode-utils so custom retry & timeout options can be used

import * as node from '@api3/airnode-node';
import * as nodeUtils from '@api3/airnode-utilities';
import { go, GoAsyncOptions } from '@api3/promise-utils';
import { BigNumber, ethers } from 'ethers';
import { getState, Provider } from './state';
import { PRIORITY_FEE_IN_WEI, BASE_FEE_MULTIPLIER } from './constants';
import { logger } from './logging';

interface BaseGasTarget {
  gasLimit?: BigNumber;
}

export interface LegacyGasTarget extends BaseGasTarget {
  type: 0;
  gasPrice: BigNumber;
}

export interface EIP1559GasTarget extends BaseGasTarget {
  type: 2;
  maxPriorityFeePerGas: BigNumber;
  maxFeePerGas: BigNumber;
}

export type GasTarget = LegacyGasTarget | EIP1559GasTarget;

export interface PriorityFee {
  readonly value: number;
  readonly unit?: 'wei' | 'kwei' | 'mwei' | 'gwei' | 'szabo' | 'finney' | 'ether';
}
export interface ChainOptions {
  readonly txType: 0 | 2;
  readonly baseFeeMultiplier?: number;
  readonly priorityFee?: PriorityFee;
  readonly fulfillmentGasLimit: number;
}

export const parsePriorityFee = ({ value, unit }: node.PriorityFee) =>
  ethers.utils.parseUnits(value.toString(), unit ?? 'wei');

export const getLegacyGasPrice = async (
  provider: Provider,
  chainOptions: ChainOptions,
  goOptions: GoAsyncOptions
): Promise<LegacyGasTarget | null> => {
  const { chainId, rpcProvider, providerName } = provider;
  const logOptionsChainId = { meta: { chainId, providerName } };

  const goGasPrice = await go(() => rpcProvider.getGasPrice(), {
    ...goOptions,
    onAttemptError: (goError) =>
      logger.warn(`Failed attempt to get legacy gas price. Error ${goError.error}`, logOptionsChainId),
  });
  if (!goGasPrice.success) {
    logger.warn(`Unable to get legacy gas price. Error: ${goGasPrice.error}`, logOptionsChainId);
    return null;
  }

  return {
    type: 0,
    gasPrice: goGasPrice.data,
    ...nodeUtils.getGasLimit(chainOptions.fulfillmentGasLimit),
  };
};

export const getEip1559GasPricing = async (
  provider: Provider,
  chainOptions: ChainOptions,
  goOptions: GoAsyncOptions
): Promise<EIP1559GasTarget | null> => {
  const { chainId, rpcProvider, providerName } = provider;
  const logOptionsChainId = { meta: { chainId, providerName } };

  const goBlock = await go(() => rpcProvider.getBlock('latest'), {
    ...goOptions,
    onAttemptError: (goError) =>
      logger.warn(`Failed attempt to get EIP-1559 gas pricing. Error ${goError.error}`, logOptionsChainId),
  });
  if (!goBlock.success) {
    logger.warn(`Unable to get EIP-1559 gas pricing. Error: ${goBlock.error}`, logOptionsChainId);
    return null;
  }
  if (!goBlock.data.baseFeePerGas) {
    logger.warn(`Unable to get base fee per gas.`, logOptionsChainId);
    return null;
  }

  const block = goBlock.data;
  const maxPriorityFeePerGas = chainOptions.priorityFee
    ? parsePriorityFee(chainOptions.priorityFee)
    : BigNumber.from(PRIORITY_FEE_IN_WEI);
  const baseFeeMultiplier = chainOptions.baseFeeMultiplier ? chainOptions.baseFeeMultiplier : BASE_FEE_MULTIPLIER;
  const maxFeePerGas = block.baseFeePerGas!.mul(BigNumber.from(baseFeeMultiplier)).add(maxPriorityFeePerGas!);

  return {
    type: 2,
    maxPriorityFeePerGas,
    maxFeePerGas,
    ...nodeUtils.getGasLimit(chainOptions.fulfillmentGasLimit),
  };
};

export const getGasPrice = async (provider: Provider, goOptions: GoAsyncOptions): Promise<GasTarget | null> => {
  const { chainId, providerName } = provider;
  const logOptionsChainId = { meta: { chainId, providerName } };

  const chainOptions = getState().config.chains[chainId].options;
  let gasTarget: GasTarget | null;
  switch (chainOptions.txType) {
    case 0:
      gasTarget = await getLegacyGasPrice(provider, chainOptions, goOptions);
      break;
    case 2:
      gasTarget = await getEip1559GasPricing(provider, chainOptions, goOptions);
      break;
  }

  if (!gasTarget) return gasTarget;

  let gasTargetMessage;
  if (gasTarget.type === 2) {
    const gweiMaxFee = node.evm.weiToGwei(gasTarget.maxFeePerGas!);
    const gweiPriorityFee = node.evm.weiToGwei(gasTarget.maxPriorityFeePerGas!);
    gasTargetMessage = `Gas price (EIP-1559) set to a Max Fee of ${gweiMaxFee} Gwei and a Priority Fee of ${gweiPriorityFee} Gwei`;
  } else {
    const gweiPrice = node.evm.weiToGwei(gasTarget.gasPrice!);
    gasTargetMessage = `Gas price (legacy) set to ${gweiPrice} Gwei`;
  }
  logger.info(gasTargetMessage, logOptionsChainId);

  return gasTarget;
};
