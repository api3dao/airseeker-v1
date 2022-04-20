# Airseeker

A tool to update a beacons with signed responses from Airnode's gateway

# Installation

```sh
yarn install
```

## Build

```sh
yarn build
```

## Configuration

You need to create a configuration file `config/airseeker.json`. Take a look at `config/airseeker.example.json` for an
example configuration file. You can use string interpolation (with `${VAR}` syntax) for providing secrets. Secrets are
read from the environment variables. When running locally, either just with `yarn start` or via process manager, secrets
are automatically loaded from `config/secrets.env` file. Take a look at `config/secrets.example.env` for an example
secrets file.

## Usage

```sh
yarn start
```

### Running with process manager

You can use [PM2](https://pm2.keymetrics.io/) process manager to run Airseeker. PM2 is also used in the
[Dockerized](#docker) version.

```sh
# Starting Airseeker
yarn pm2:start
# PM2 status
yarn pm2:status
# Logs
yarn pm2:logs
# Stopping Airseeker
yarn pm2:stop
```

## Docker

The container is running the Airseeker with the [PM2](https://pm2.keymetrics.io/) process manager and running a cronjob
taking care of log rotation with [logrotate](https://linux.die.net/man/8/logrotate). We're using a default
[generated logrotate configuration from PM2](https://pm2.keymetrics.io/docs/usage/log-management/#setting-up-a-native-logrotate).

### Build

```sh
yarn docker:build
```

Resulting image is named `api3/airseeker`.
