const AWS = require('aws-sdk');

const ssm = new AWS.SSM();

export function handler(event, context, callback) {
    sendCommand(event.command, event.instanceId)
        .then(commandId => getCommandResult(commandId, event.instanceId))
        .then(result => callback(null, result))
        .catch(error => {
            console.log("Error: " + error);
            callback(error)
        })
}

function wait(millis) {
    return new Promise((resolve, reject) => {
        setTimeout(() => resolve(), millis)
    });
}

function sendCommand(command, instanceId) {
    return new Promise((resolve, reject) => {
        const sendCommandParams = {
            DocumentName: "AWS-RunShellScript",
            Parameters: {
                commands: [
                    command
                ]
            },
            InstanceIds: [
                instanceId
            ]
        };

        ssm.sendCommand(sendCommandParams,function (err, data) {
            if (err) reject(err);
            else resolve(data.Command.CommandId)
        });
    })
}

async function getCommandResult(commandId, instanceId) {
    await wait(2000);

    return new Promise((resolve, reject) => {
        const getCommandParams = {
            InstanceId: instanceId,
            CommandId: commandId
        };

        ssm.getCommandInvocation(getCommandParams, function (err, data) {
            if (data.Status === "Success") resolve(data.StandardOutputContent);
            else reject(data.StatusDetails)
        });
    })
}
