#!/bin/bash

set -e

SECRETS_FILE=$(dirname $(readlink -f "$0"))/../config/secrets.env

# Enable automatic export of variables
set -a
# Source variables from secrets.env
source <(grep -v "^\s*#" ${SECRETS_FILE} | sed 's/\([^=]*\)=\(.*\)/\1=\"\2"/')
# Disable automatic export of variables
set +a

exec "$@"
