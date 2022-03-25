ARG build=local

# Environment
FROM node:14.17-alpine3.14 AS environment

ENV name="airseeker" \
    appDir="/app" \
    buildDir="/build"
ENV packageDir="${buildDir}/package"

# Build preparation
FROM environment AS preparation

WORKDIR ${buildDir}

RUN apk add --update --no-cache git

# Source preparation - local
FROM preparation as sourcelocal

COPY . ${buildDir}

# Source preparation - git
FROM preparation as sourcegit

ARG branch=main
ARG repository=https://github.com/api3dao/airseeker.git

RUN git clone --single-branch --branch ${branch} ${repository} ${buildDir}

# Production dependencies
FROM source${build} AS deps

RUN yarn install --production --no-optional --ignore-scripts

# Production source code
FROM source${build} AS build

RUN yarn install && \
    yarn build && \
    yarn pack && \
    mkdir -p ${packageDir} && \
    tar -xf *.tgz -C ${packageDir} --strip-components 1

# Result image
FROM environment

ENV cronjob="/etc/cron.d/logrotate"

WORKDIR ${appDir}

LABEL application=${name} \
      description="A tool to update a beacons with signed responses from Airnode's gateway"

COPY --from=deps ${buildDir}/node_modules ./node_modules
COPY --from=build ${packageDir} .
COPY docker/entrypoint.sh /entrypoint.sh
COPY docker/logrotate-crontab ${cronjob}

    # Create Airseeker user
RUN addgroup -S ${name} && \
    adduser -h ${appDir} -s /bin/false -S -D -H -G ${name} ${name} && \
    chown -R ${name} ${appDir} && \
    # Install pm2
    yarn global add pm2 && \
    # Install dependencies
    apk add --update --no-cache logrotate su-exec && \
    # Clear any default logrotate configurations
    rm /etc/logrotate.d/* && \
    # Enable logrotate cronjob
    chmod +x ${cronjob} && \
    crontab -u ${name} ${cronjob}

# Need to do this after the RUN directive because we first want to clear the /etc/logrotate.d directory
COPY docker/pm2-airseeker /etc/logrotate.d/pm2-airseeker

ENTRYPOINT ["/entrypoint.sh"]
