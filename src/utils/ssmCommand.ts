import {delay} from "./helperFunctions";
import {
    GetCommandInvocationCommand,
    GetCommandInvocationCommandOutput,
    SendCommandCommand,
    SendCommandCommandOutput,
    SSM
} from "@aws-sdk/client-ssm";
import {GetObjectCommand, GetObjectCommandOutput, S3} from "@aws-sdk/client-s3";

const ssm = new SSM();
const s3 = new S3();

export async function ssmCommand(command: string, instanceId: string, outputExpected: boolean = true): Promise<string> {
    const response = await sendCommand(command, instanceId);
    await delay(response);
    const result = await awaitCommandResult(response.Command.CommandId, instanceId, 6);
    if (result.Status === 'Success' && outputExpected) {
        await delay(result);
        const s3response = await getResultFromS3(result.StandardOutputUrl);
        return s3response.Body.transformToString();
    } else if (result.Status === 'Success' && !outputExpected) {
        return "success";
    } else {
        return Promise.reject(new Error(`SSM command executed on ${instanceId} not successfully completed. status='${result.Status}' errorContent='${result.StandardErrorContent}' command='${command}'`))
    }
}

async function sendCommand(command, instanceId): Promise<SendCommandCommandOutput> {
    console.log(`sending SSM command: ${command} for instance: ${instanceId}`);
    const req = new SendCommandCommand({
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
    });
    return ssm.send(req);
}

const terminalState = new Set(['Success', 'TimedOut', 'Failed', 'Cancelled']);

async function awaitCommandResult(commandId: string, instanceId: string, remainingRetries: number): Promise<GetCommandInvocationCommandOutput> {
    const result = await getCommandResult(commandId, instanceId);
    if (terminalState.has(result.Status) || remainingRetries <= 0) {
        console.log(`Final state: ${result.Status}; remaining retries: ${remainingRetries}`);
        return result;
    } else {
        console.log(`Retrying getCommandResult. Current state: ${result.Status}; remaining retries: ${remainingRetries}`);
        await new Promise(res => setTimeout(res, 10000));
        return awaitCommandResult(commandId, instanceId, remainingRetries-1);
    }
}

function getCommandResult(commandId, instanceId): Promise<GetCommandInvocationCommandOutput> {
    return ssm.send(new GetCommandInvocationCommand({
        InstanceId: instanceId,
        CommandId: commandId
    }));
}

function getResultFromS3(s3Url: string): Promise<GetObjectCommandOutput> {
    return s3.send(new GetObjectCommand({
        Bucket: process.env.SSM_BUCKET_NAME,
        Key: s3Url.split(`${process.env.SSM_BUCKET_NAME}/`)[1]
    }));
}
