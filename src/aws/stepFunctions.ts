import { ListExecutionsInput, ListExecutionsOutput } from 'aws-sdk/clients/stepfunctions';

const AWS = require('aws-sdk');
const awsStepFunctions = new AWS.StepFunctions;

export function totalRunningExecutions(stepFunctionArn: string): Promise<number> {
    const params: ListExecutionsInput = {
        stateMachineArn: stepFunctionArn,
        statusFilter: 'RUNNING'
    };
    const requestPromise: Promise<ListExecutionsOutput> = awsStepFunctions.listExecutions(params).promise();
    return new Promise<number>((resolve, reject) => {
        requestPromise.then(
            function (data: ListExecutionsOutput) {
                resolve(data.executions.length);
            },
            function (error) {
                console.log(error, error.stack, error.statusCode);
                reject(error);
            }
        );
    })
}
