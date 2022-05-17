import { parse } from 'dotenv';
import { join } from 'path';
import map from 'lodash/map';
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';

const secretsFile = readFileSync(join(__dirname, '../config/secrets.env'), 'utf-8');
const secrets = parse(secretsFile);

const command = [`cross-env`, ...map(secrets, (val, key) => `${key}="${val}"`), ...process.argv.slice(2)].join(' ');

spawnSync(command, { shell: true, stdio: 'inherit' });
