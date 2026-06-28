#!/usr/bin/env bash
# Distribute shared code + persona content into each Lambda asset dir before synth/deploy.
set -euo pipefail
cd "$(dirname "$0")/.."

for d in lead chat admin; do
  cp lambdas/_shared/common.py "lambdas/$d/common.py"
done

# Chat needs the persona + knowledge base bundled in.
rm -rf lambdas/chat/content
cp -r ../content lambdas/chat/content

echo "prebuild: synced common.py -> lead/verify/chat/admin; content -> chat"
