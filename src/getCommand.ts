const AWS = require('aws-sdk');

export function handler(event, context, callback) {
    const ssm = new AWS.SSM();

    const getCommandParams = {
        InstanceId: event.instanceId,
        CommandId: event.commandId
    };

    ssm.getCommandInvocation(getCommandParams, function(err, data) {
        if (err) console.log(err, err.stack);
        else {
            if (data.Status === "Success") callback(null, data.StandardOutputContent)
            else callback(data.StatusDetails, null)
        }
    });
}
