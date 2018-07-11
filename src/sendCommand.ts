import SSM = require("aws-sdk/clients/ssm");
const AWS = require('aws-sdk');
const ssm = new AWS.SSM();

export async function handler(event) {
    return new Promise((resolve, reject) => {
        sendCommand(event.command, event.instanceId)
            .then((sendResult: SSM.Types.SendCommandResult) => wait(2000, sendResult.Command.CommandId))
            .then((commandId: string) => getCommandResult(commandId, event.instanceId))
            .then((result: SSM.Types.GetCommandInvocationResult) => {
                if (result.Status === "Success") resolve(result.StandardOutputContent)
                else reject(`SSM command result was: ${result.Status} / ${result.StatusDetails}`)
            })
            .catch(error => {
                console.log("Error: " + error);
                reject(error)
            })
    });
}

function wait(millis: number, value) {
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(value), millis)
    });
}

function sendCommand(command, instanceId): Promise<SSM.Types.SendCommandResult> {
    return ssm.sendCommand({
        DocumentName: "AWS-RunShellScript",
        Parameters: {
            commands: [
                command
            ]
        },
        InstanceIds: [
            instanceId
        ]
    }).promise();
}

function getCommandResult(commandId, instanceId): Promise<SSM.Types.GetCommandInvocationResult> {
    return ssm.getCommandInvocation({
        InstanceId: instanceId,
        CommandId: commandId
    }).promise();
}
