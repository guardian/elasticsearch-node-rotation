const AWS = require('aws-sdk');

export function handler(event, context, callback) {
    const ssm = new AWS.SSM();

    const sendCommandParams = {
        DocumentName: "AWS-RunShellScript",
        Parameters: {
            commands: [
                event.command
            ]
        },
        InstanceIds: [
            event.instanceId
        ]
    };

    ssm.sendCommand(sendCommandParams,  function (err, data) {
        if (err) console.log(err, err.stack);
        else {
            callback(null, JSON.stringify({
                commandId: data.Command.CommandId,
                instanceId: event.instanceId
            }));
        }
    });
}
