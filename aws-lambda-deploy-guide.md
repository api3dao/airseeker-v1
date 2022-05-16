# AWS Lambda Deployment Guide

Export AWS credentials in your terminal or ensure your local aws installation is logged in.

Run:

```shell
yarn sls deploy --region us-east-1
```

The app won't immediately start (due to the scheduler). You can jumpstart the app by calling

```shell
yarn sls invoke --function airseeker &
```

to remove run:

```shell
yarn sls remove
```

Sometimes a stack fails to be removed automatically. In these cases navigate to "Cloud Formation" in the AWS console and
check the resources tab of the stack in question to see errors. Manually remove those resources.
