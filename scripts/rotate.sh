#!/usr/bin/env bash

set -e

if [[ $# -lt 3 ]]
then
  echo "$0 STEP_FUNCTION_ARN ASG AWS_PROFILE"
  exit 1
fi

ARN=$1
ASG=$2
AWS_PROFILE=$3

running_jobs=$(aws stepfunctions list-executions \
    --state-machine-arn ${ARN} \
    --status-filter RUNNING \
    --profile ${AWS_PROFILE} \
    --region eu-west-1 \
    | jq '.executions | length')

if [[ ${running_jobs} == 0 ]]; then
  echo "Starting node rotation..."
  aws stepfunctions start-execution \
    --state-machine-arn ${ARN} \
    --name rotate-$(date +%s)\
    --input "{\"asgName\":\"${ASG}\",\"stepFunctionArn\":\"${ARN}\"}" \
    --profile ${AWS_PROFILE} \
    --region eu-west-1
  echo -e "✅ Done"
else
  echo -e "🚨️ Step function is currently running ${running_jobs} jobs."
  exit 1
fi


