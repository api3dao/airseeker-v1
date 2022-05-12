# GCP Deployment Guide

### Log in

```shell
gcloud auth application-default login
```

### Enable the APIs

> only has to be done once per project, can take a while for them to become available

```shell
gcloud config set functions/region us-east1
gcloud services enable artifactregistry.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable eventarc.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable logging.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable cloudfunctions.googleapis.com
```

or navigate to
[this link](https://console.cloud.google.com/apis/enableflow?apiid=cloudbuild.googleapis.com,artifactregistry.googleapis.com,eventarc.googleapis.com,run.googleapis.com,logging.googleapis.com,pubsub.googleapis.com,cloudfunctions.googleapis.com&redirect=https:%2F%2Fcloud.google.com%2Ffunctions%2Fquickstart&_ga=2.19151160.1691725041.1652257462-1651855105.1650465482)

APIs can take a few minutes to enable (or longer).

### Convert secrets.env to yml

It should look like this:

```yaml
HTTP_SIGNED_DATA_GATEWAY_KEY_AMBERDATA_AWS: 42789345698325693468aa3829...
HTTP_SIGNED_DATA_GATEWAY_URL_AMBERDATA_AWS: https://something.us-east-1.amazonaws.com/v1
```

and can be done using this command:

```shell
sed 's/=/: /g' config/secrets.env > config/secrets.yml
```

### Convert `config.json` to an _inline_ .ts file

(this avoids the use of a bucket)

```shell
rm -rf src/config-inline.ts
echo -n "export const config = " > src/config-inline.ts
cat config/airseeker.json >> src/config-inline.ts
echo -n ";" >> src/config-inline.ts
```

### Create a pub/sub topic as the event bus equivalent

```shell
gcloud pubsub topics create airseeker-trigger-topic
```

### Create a scheduler to push events to the topic

```shell
gcloud scheduler jobs create pubsub airseeker-scheduler --location=us-east1 --schedule="8 * * * *" --topic=airseeker-trigger-topic --message-body="hello"
```

### Build and Deploy

```shell
yarn build; # possibly not necessary
gcloud beta functions deploy airseeker --gen2 --runtime nodejs14 --entry-point main --memory 512MB --source . --region us-east1 --env-vars-file=config/secrets.yml --timeout=540 --trigger-topic=airseeker-trigger-topic
# or gen 1:
gcloud functions deploy airseeker --trigger-topic=airseeker-trigger-topic --runtime nodejs14 --entry-point main --memory=512MB --max-instances 1 --min-instances 1 --source . --region=us-east1 --env-vars-file=config/secrets.yml --timeout=540
```

## Removal

```shell
gcloud scheduler jobs delete airseeker-scheduler --location us-east1
gcloud pubsub topics delete airseeker-trigger-topic
gcloud beta functions delete airseeker --gen2 --region us-east1
```
