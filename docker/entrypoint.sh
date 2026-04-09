#!/bin/sh
set -e

# Apply migrations before starting the app (idempotent).
./node_modules/.bin/prisma migrate deploy

exec node node_modules/next/dist/bin/next start -p 3000
