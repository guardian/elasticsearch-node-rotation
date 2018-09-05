#!/bin/bash
set -e

npm install -g yarn

yarn install
# Will place .js files in target
yarn run clean
yarn run build

yarn run test

# Set up a package.json for CAPI
cp package.json target/capi-package.json
sed -i -e "s,@@PREFIX,capi,g" target/capi-package.json

# Set up a package.json for Deploy Tools
cp package.json target/tools-package.json
sed -i -e "s,@@PREFIX,tools,g" target/tools-package.json

pushd target
# Ensures the RiffRaff package has the node_modules needed to run
yarn install --production
popd

function deploymentPackages {
    cp target/$1-package.json package.json
    cp target/$1-package.json target/package.json
    cp riff-raff-$1.yaml riff-raff.yaml
    cp riff-raff-$1.yaml target/riff-raff.yaml
    yarn run package
}

# Create deployment packages for CAPI
deploymentPackages capi

# Create deployment packages for Deploy Tools
deploymentPackages tools

