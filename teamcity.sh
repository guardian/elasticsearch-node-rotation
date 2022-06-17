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

(
  cd cdk
  # Set --yes to install projen without a prompt
  npx projen --yes
  npx projen lint
  npx projen test
  npx projen synth
)

yarn install --frozen-lockfile

# Will place .js files in target
yarn run clean
yarn run build

yarn run test
yarn run riffRaffUpload
