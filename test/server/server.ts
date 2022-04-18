import express from 'express';
import { validSignedData } from '../fixtures';

const PORT = 5432;

const app = express();

app.post('/signed-data-gateway/endpoint', (_req: any, res: any) => {
  res.status(200).send(validSignedData);
});

app.get('/convert', (req, res) => {
  const { from, to } = req.query;

  if (from === 'ETH' && to === 'USD') {
    res.status(200).send({ success: true, result: '723.39202' });
    return;
  }

  if (from === 'BTC' && to === 'USD') {
    res.status(200).send({ success: true, result: '41091.12345' });
    return;
  }

  res.status(404).send({ success: false, error: 'Unknown price pair' });
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
