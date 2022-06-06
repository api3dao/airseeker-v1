# AWS Lambda Deployment Guide

Export AWS credentials in your terminal or ensure your local aws installation is logged in.

**Build Airseeker:**

```shell
yarn build
```

### General Airseeker Deployment Notes

The deployed Airseeker function won't immediately start (due to the scheduler).

There are three main strategies for dealing with this:

1. If an Airseeker is already deployed, deploy the new Airseeker using a different service name in `serverless.yaml`, so
   that both Airseekers can run concurrently. Wait for the new Airseeker to start. Once it does, ensure that you're
   satisfied that it is functioning correctly (by referring to the target chains and/or CloudWatch logs). You may then
   revert the name of the service stack to the old Airseeker and remove it or alternatively delete it using the AWS
   CloudFormation console.
2. Deploy Airseeker using the default service name and start the new Airseeker immediately using the invoke commands
   below.
3. Deploy Airseeker using the default service name and wait up to 14 minutes for the deployed Airseeker to start.

**Deploy Airseeker:**

```shell
yarn sls deploy --region us-east-1
```

**Invoke Airseeker:** (Optional)

```shell
# Invoke the remote function - this will block until the Lambda times out, so we need to send it to the background and
# then kill it prematurely. Killing this process does not stop the Lambda from continuing to execute. This command will
# cause a scenario where two invocation instances of the Airseeker function will overlap temporarily.
yarn sls invoke --function airseeker &

# Store the PID of the previous command in a variable called `pid`
pid=$!

# Wait a bit
sleep 10;

# Kill the background process
kill $pid
```

to remove run:

```shell
yarn sls remove
```

### Caveats

Sometimes a stack fails to be removed automatically. In these cases navigate to "Cloud Formation" in the AWS console and
check the resources tab of the stack in question to see errors. Manually remove those resources.

In particular AWS will sometimes refuse to delete an associated S3 bucket. Empty the bucket and remove it, then
re-remove the CloudFormation stack.
