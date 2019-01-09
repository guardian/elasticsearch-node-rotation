#!/bin/bash
set -e

npm install -g yarn

yarn install
# Will place .js files in target
yarn run clean
yarn run build

yarn run test

cp cloudformation.yaml target

function packageAndUpload {
    echo "Now doing package and upload for $1"
    # Set up a project specific package.json
    sed -e "s,@@PREFIX,$1,g" package.json > target/$1-package.json

    pushd target
    # Ensures the RiffRaff package has the node_modules needed to run
    yarn install --production
    popd

    cp target/$1-package.json package.json
    cp target/$1-package.json target/package.json
    cp riff-raff-$1.yaml riff-raff.yaml
    cp riff-raff-$1.yaml target/riff-raff.yaml
    yarn run package
}

packageAndUpload capi
packageAndUpload tools # Deploy Tools
packageAndUpload ophan

