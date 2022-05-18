# AWS Lambda Deployment Guide

Export AWS credentials in your terminal or ensure your local aws installation is logged in.

Run:

```shell
yarn sls deploy --region us-east-1
```

The app won't immediately start (due to the scheduler). You can jumpstart the app by calling

```shell
# Invoke the function remotely - this will block until the Lambda times out, so we need to send
# it to the background and then kill it prematurely
yarn sls invoke --function airseeker &

# Store the PID of the previous command in a variable called `pid`
pid=$$

# Wait a bit
sleep 10;

# Kill the background process
kill $pid
```

to remove run:

```shell
yarn sls remove
```

Sometimes a stack fails to be removed automatically. In these cases navigate to "Cloud Formation" in the AWS console and
check the resources tab of the stack in question to see errors. Manually remove those resources.
