#!/bin/sh

# Enable automatic export of variables
set -a
# Source variables from secrets.env
. $(dirname $(readlink -f "$0"))/../config/secrets.env
# Disable automatic export of variables
set +a

exec "$@"
