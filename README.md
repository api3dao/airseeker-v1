# Airseeker

A tool to update a beacons with signed responses from Airnode's gateway

## Installation

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

### Gas oracle options

- `fallbackGasPrice`: (required) - The gas price to use for beacon update transactions if fetching both blocks and
  fallback gas prices fails. Defined as an object, e.g. `{"value": 10, "unit": "gwei"}`.
- `maxTimeout`: (optional) - The maximum timeout (in seconds) for fetching a block or fallback gas price (defaults to
  `3`).
- `recommendedGasPriceMultiplier`: (optional) - The multiplier to apply to the fallback gas price reported by the
  provider. The multiplier will not be applied to the config `fallbackGasPrice`.

- `latestGasPriceOptions`: (optional) - An object containing the following configuration options for calculating a gas
  price:
  - `percentile`: (optional) - The percentile of gas prices to return from a block (defaults to `60`).
  - `minTransactionCount`: (optional) - The minimum amount of transactions required in a block to use for calculating a
    gas price percentile (defaults to `10`).
  - `pastToCompareInBlocks`: (optional) - The number of blocks to look back for the reference block (defaults to `20`).
  - `maxDeviationMultiplier`: (optional) - The maximum deviation multiplier of the latest block gas price percentile
    compared to the reference block gas price percentile (defaults to `2`). Used to protect against large gas price
    spikes.

## Usage

```sh
yarn start
```

## Deploy

### Credentials

Export AWS credentials in your terminal or ensure your local aws installation is logged in.

### General Airseeker Deployment Notes

The deployed Airseeker function won't immediately start (due to the scheduler).

There are two main strategies for dealing with this:

1. Deploy Airseeker and start the new Airseeker immediately using the invoke commands below.
2. Deploy Airseeker and wait up to 14 minutes for the deployed Airseeker to start.

**Deploy Airseeker:**

```shell
yarn sls deploy --region us-east-1 --config serverless.aws.yml
```

**Invoke Airseeker:** (Optional)

```shell
# Invoke the remote function - this will block until the Lambda times out, so we need to send it to the background and
# then kill it prematurely. Killing this process does not stop the Lambda from continuing to execute. This command will
# cause a scenario where two invocation instances of the Airseeker function will overlap temporarily.
yarn sls invoke --config serverless.aws.yml --function airseeker &

# Store the PID of the previous command in a variable called `pid`
pid=$!

# Wait a bit
sleep 10;

# Kill the background process
kill $pid
```

**Remove Airseeker:**

```shell
yarn sls remove --config serverless.aws.yml
```

**Update Airseeker**

If an Airseeker is already deployed, deploy the new Airseeker using a different service name in `serverless.yaml`, so
that both Airseekers can run concurrently. Wait for the new Airseeker to start. Once it does, ensure that you're
satisfied that it is functioning correctly (by referring to the target chains and/or CloudWatch logs). You may then
revert the name of the service stack to the old Airseeker and remove it or alternatively delete it using the AWS
CloudFormation console.

### Caveats

Sometimes a stack fails to be removed automatically. In these cases navigate to "Cloud Formation" in the AWS console and
check the resources tab of the stack in question to see errors. Manually remove those resources.

In particular AWS will sometimes refuse to delete an associated S3 bucket. Empty the bucket and remove it, then
re-remove the CloudFormation stack.
