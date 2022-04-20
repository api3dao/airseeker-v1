import express from 'express';
import { validSignedData } from '../fixtures';

const PORT = 5432;

const app = express();

app.post('/signed-data-gateway/endpoint', (_req: any, res: any) => {
  res.status(200).send(validSignedData);
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
