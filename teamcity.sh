#!/bin/bash
set -e

npm install -g yarn

yarn install
# Will place .js files in target
yarn run clean
yarn run build

yarn run test

# These also need to be in the RiffRaff package
cp package.json target
cp riff-raff.yaml target

pushd target
# Ensures the RiffRaff package has the node_modules needed to run
yarn install --production
popd

yarn run package
