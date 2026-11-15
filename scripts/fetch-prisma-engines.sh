#!/bin/bash
# BachatPharma — Prisma engine download workaround.
# Why this exists: in this environment, Prisma's Node-based downloader fails
# with ECONNRESET through the egress proxy, while curl works fine.
# On a normal network, `npm install` downloads these automatically and you
# do NOT need this script. If `npx prisma generate` / `migrate` fails with
# ECONNRESET here, run: bash scripts/fetch-prisma-engines.sh
set -e
V="717184b7b35ea05dfa71a3236b7af656013e1e49" # Prisma 6.14.0 engines version
TARGET="debian-openssl-3.0.x"
BASE="https://binaries.prisma.sh/all_commits/$V/$TARGET"
cd "$(dirname "$0")/.."
mkdir -p node_modules/prisma node_modules/@prisma/engines
curl -sL --max-time 120 -o /tmp/libquery_engine.so.node.gz "$BASE/libquery_engine.so.node.gz"
curl -sL --max-time 120 -o /tmp/schema-engine.gz "$BASE/schema-engine.gz"
gunzip -c /tmp/libquery_engine.so.node.gz > node_modules/prisma/libquery_engine-$TARGET.so.node
gunzip -c /tmp/schema-engine.gz > node_modules/prisma/schema-engine-$TARGET
chmod +x node_modules/prisma/schema-engine-$TARGET
cp node_modules/prisma/libquery_engine-$TARGET.so.node node_modules/@prisma/engines/
cp node_modules/prisma/schema-engine-$TARGET node_modules/@prisma/engines/
echo "Prisma engines installed for $TARGET"
