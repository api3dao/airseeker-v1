// Taken from @api3/airnode-utils so custom retry & timeout options can be used
import 'source-map-support/register';
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
  txType: 'legacy';
  gasPrice: BigNumber;
}

export interface EIP1559GasTarget extends BaseGasTarget {
  txType: 'eip1559';
  maxPriorityFeePerGas: BigNumber;
  maxFeePerGas: BigNumber;
}

export type GasTarget = LegacyGasTarget | EIP1559GasTarget;

export const parsePriorityFee = ({ value, unit }: node.PriorityFee) =>
  ethers.utils.parseUnits(value.toString(), unit ?? 'wei');

export const multiplyGasPrice = (gasPrice: BigNumber, gasPriceMultiplier: number) =>
  gasPrice.mul(BigNumber.from(Math.round(gasPriceMultiplier * 100))).div(BigNumber.from(100));

export const getLegacyGasPrice = async (
  provider: Provider,
  chainOptions: node.ChainOptions & { gasPriceMultiplier?: number },
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

  const multipliedGasPrice = chainOptions.gasPriceMultiplier
    ? multiplyGasPrice(goGasPrice.data, chainOptions.gasPriceMultiplier)
    : goGasPrice.data;

  return {
    txType: 'legacy',
    gasPrice: multipliedGasPrice,
    ...nodeUtils.getGasLimit(chainOptions.fulfillmentGasLimit),
  };
};

export const getEip1559GasPricing = async (
  provider: Provider,
  chainOptions: node.ChainOptions,
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
    txType: 'eip1559',
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
    case 'legacy':
      gasTarget = await getLegacyGasPrice(provider, chainOptions, goOptions);
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
  logger.info(gasTargetMessage, logOptionsChainId);

  return gasTarget;
};
