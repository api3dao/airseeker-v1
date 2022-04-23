import express from 'express';
import { validSignedData } from '../fixtures';
import { logger } from '../../src/logging';
import { initializeState } from '../../src/state';

initializeState(null as any); // We don't care about airseeker.json file

const PORT = 5432;

const app = express();

app.post('/signed-data-gateway/endpoint', (_req: any, res: any) => {
  res.status(200).send(validSignedData);
});

app.listen(PORT, () => {
  logger.log(`Server is running at http://localhost:${PORT}`);
});
