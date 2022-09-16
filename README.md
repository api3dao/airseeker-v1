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
read from the environment variables. Take a look at `config/secrets.example.env` for an example secrets file.

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

## Running Airseeker locally (Optional)

1. For running Airseeker locally you can make use of the pm2 testing services by running this command in a terminal:

   ```shell
   yarn run dev:testing-services:start
   ```

   A local ethereum node will be started along with a node.js express server that will return signed data (basically a
   substitute to the Airnode's signed data gateway).

2. Next step is to run this script:

   ```shell
   yarn run dev:setup-local-node
   ```

   This will deploy the DapiServer contract to the local ethereum node and also send funds to a test Airseeker sponsor
   wallet (used to submit data feed update transactions).

3. Then you might also want to run the following script to create the required testing config files:

   ```shell
   yarn run dev:create-local-config
   ```

   You should verify that the DapiServer contract address in the `config/airseeker.json` file matches the address
   displayed when running the script from the previous step. Secrets are automatically loaded from `config/secrets.env`
   file when Airseeker is invoked locally.

4. Lastly you need to invoke Airseeker via serverless framework like this:

   ```shell
   yarn sls invoke local --config serverless.aws.yml -f airseeker
   ```

5. If you want to stop the testing services after exiting the Airseeker process you can run the following command:

   ```shell
   yarn run dev:testing-services:stop
   ```
