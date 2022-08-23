import { loadConfig } from '../../src/config';
import { main } from '../../src/main';

const configPath = process.argv[2];

const config = loadConfig(configPath, process.env);
main(config);
