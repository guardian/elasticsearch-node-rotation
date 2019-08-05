import SSM = require('aws-sdk/clients/ssm');
import {Url} from 'aws-sdk/clients/ssm';
import {GetObjectOutput} from "aws-sdk/clients/s3";
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();
const s3 = new AWS.S3();

export function ssmCommand(command: string, instanceId: string, outputExpected: boolean = true): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        sendCommand(command, instanceId)
            .then(delay)
            .then((sendResult: SSM.Types.SendCommandResult) => awaitCommandResult(sendResult.Command.CommandId, instanceId, 3))
            .then((result: SSM.Types.GetCommandInvocationResult) => {
                if (result.Status === 'Success' && outputExpected) return (result.StandardOutputUrl);
                else if (result.Status === 'Success' && !outputExpected) resolve("success");
                else reject(`SSM command result was: ${result.Status} / ${result.StandardErrorContent}`)
            })
            .then(delay)
            .then(getResultFromS3)
            .then((result: GetObjectOutput) => resolve(result.Body.toString()))
            .catch(reject)
    });
}

function sendCommand(command, instanceId): Promise<SSM.Types.SendCommandResult> {
    return ssm.sendCommand({
        DocumentName: 'AWS-RunShellScript',
        Parameters: {
            commands: [
                command
            ]
        },
        InstanceIds: [
            instanceId
        ],
        OutputS3BucketName: process.env.SSM_BUCKET_NAME
    }).promise();
}

function delay(value) {
    return new Promise((resolve) => {
       setTimeout(() => resolve(value), 10000)
    });
}

const terminalState = new Set(['Success', 'TimedOut', 'Failed', 'Cancelled']);

function awaitCommandResult(commandId: string, instanceId: string, remainingRetries: number): Promise<SSM.Types.GetCommandInvocationResult> {
    return getCommandResult(commandId, instanceId)
        .then((result: SSM.Types.GetCommandInvocationResult) => {
            if (terminalState.has(result.Status) || remainingRetries <= 0) {
                console.log(`Final state: ${result.Status}; remaining retries: ${remainingRetries}`);
                return result;
            } else {
                console.log(`Retrying getCommandResult. Current state: ${result.Status}; remaining retries: ${remainingRetries}`);
                return new Promise(res => setTimeout(res, 10000)).then(() => {
                    return awaitCommandResult(commandId, instanceId, remainingRetries-1)
                });
            }
        });
}

function getCommandResult(commandId, instanceId): Promise<SSM.Types.GetCommandInvocationResult> {
    return ssm.getCommandInvocation({
        InstanceId: instanceId,
        CommandId: commandId
    }).promise();
}

function getResultFromS3(s3Url: Url): Promise<GetObjectOutput> {
    return s3.getObject({
        Bucket: process.env.SSM_BUCKET_NAME,
        Key: s3Url.split(`${process.env.SSM_BUCKET_NAME}/`)[1]
    }).promise();
}
