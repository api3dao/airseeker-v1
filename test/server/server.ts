import express from 'express';
import { ethers } from 'ethers';
import * as abi from '@api3/airnode-abi';
import { validSignedData } from '../fixtures/index';
import { logger } from '../../src/logging';
import { initializeState } from '../../src/state';

initializeState({ log: { format: 'plain', level: 'INFO' } } as any); // We don't care about airseeker.json file

const templateIdETH = '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa';
const templateIdBTC = '0x0bbf5f2ec4b0e9faf5b89b4ddbed9bdad7a542cc258ffd7b106b523aeae039a6';
const airnodeWallet = ethers.Wallet.fromMnemonic(
  'achieve climb couple wait accident symbol spy blouse reduce foil echo label'
);

const getTimestampAndSignature = async (airnodeWallet: ethers.Wallet, templateId: string, data: string) => {
  // Add a few seconds to the timestamp to ensure it is valid
  const timestamp = Math.floor(Date.now() / 1000) + 3;

  const signature = await airnodeWallet.signMessage(
    ethers.utils.arrayify(
      ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'uint256', 'bytes'], [templateId, timestamp, data || '0x'])
      )
    )
  );

  return { timestamp, signature };
};

const PORT = 5432;

const app = express();
app.use(express.json());

app.post('/signed-data-gateway/:endpoint', async (req, res) => {
  const encodedParameters = req.body.encodedParameters;
  const decodedParameters = abi.decode(encodedParameters);
  const { from, to } = decodedParameters;

  if (from === 'ETH' && to === 'USD') {
    const apiValue = ethers.BigNumber.from(800 * 1_000_000);
    const encodedValue = ethers.utils.defaultAbiCoder.encode(['int256'], [apiValue]);
    const { timestamp, signature } = await getTimestampAndSignature(airnodeWallet, templateIdETH, encodedValue);

    res.status(200).send({
      timestamp: `${timestamp}`,
      encodedValue: ethers.utils.hexZeroPad(apiValue.toHexString(), 32),
      signature: signature,
    });
    return;
  }

  if (from === 'BTC' && to === 'USD') {
    const apiValue = ethers.BigNumber.from(43_000 * 1_000_000);
    const encodedValue = ethers.utils.defaultAbiCoder.encode(['int256'], [apiValue]);
    const { timestamp, signature } = await getTimestampAndSignature(airnodeWallet, templateIdBTC, encodedValue);
    res.status(200).send({
      timestamp: `${timestamp}`,
      encodedValue: ethers.utils.hexZeroPad(apiValue.toHexString(), 32),
      signature: signature,
    });
    return;
  }

  res.status(200).send(validSignedData);
});

app.listen(PORT, () => {
  logger.info(`Server is running at http://localhost:${PORT}`);
});
