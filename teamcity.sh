#!/bin/bash
set -e

npm install -g yarn

yarn install
# Will place .js files in target
yarn run clean
yarn run build

yarn run test

cp cloudformation.yaml target/

cp package.json target/

pushd target
# Ensures the RiffRaff package has the node_modules needed to run
yarn install --production
popd

cp riff-raff.yaml target/
yarn run package
