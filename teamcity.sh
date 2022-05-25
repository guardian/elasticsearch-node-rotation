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
yarn run riffRaffUpload
