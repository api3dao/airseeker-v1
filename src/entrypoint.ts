// This file is used when running Airseeker directly via NodeJS
import * as path from 'path';
import { loadConfig } from './config';
import { main } from './main';

const config = loadConfig(path.join(__dirname, '..', 'config', 'airseeker.json'), process.env);
main(config);
