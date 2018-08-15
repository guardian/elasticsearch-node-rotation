import SSM = require('aws-sdk/clients/ssm');
import {Url} from 'aws-sdk/clients/ssm';
import {GetObjectOutput} from "aws-sdk/clients/s3";
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();
const s3 = new AWS.S3();

export function ssmCommand(command: string, instanceId: string, outputExpected: boolean = true): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        sendCommand(command, instanceId)
            .then((sendResult: SSM.Types.SendCommandResult) => wait(10000, sendResult.Command.CommandId))
            .then((commandId: string) => getCommandResult(commandId, instanceId))
            .then((result: SSM.Types.GetCommandInvocationResult) => {
                if (result.Status === 'Success' && outputExpected) return (result.StandardOutputUrl);
                else if (result.Status === 'Success' && !outputExpected) resolve("success");
                else reject(`SSM command result was: ${result.Status} / ${result.StandardErrorContent}`)
            })
            .then((url: Url) => wait(10000, url))
            .then(getResultFromS3)
            .then((result: GetObjectOutput) => resolve(result.Body.toString()))
            .catch(reject)
    });
}

function wait(millis: number, value) {
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(value), millis)
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
