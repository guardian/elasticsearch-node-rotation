#!/bin/bash
set -e

# source NVM on teamcity
if [ -e "${NVM_DIR}/nvm.sh" ]; then
    . ${NVM_DIR}/nvm.sh
else
    . $(brew --prefix nvm)/nvm.sh
fi
nvm install
nvm use

npm install -g yarn

yarn install --frozen-lockfile
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
