const AWS = require('aws-sdk');

export function handler(event, context, callback) {

    function wait() {
      return new Promise((resolve, reject) => {
        setTimeout(() => resolve(), 2000)
      });
    }

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

    ssm.sendCommand(sendCommandParams, async function (err, data) {
        if (err) console.log(err, err.stack);
        else {
            await wait();

            const getCommandParams = {
              InstanceId: event.instanceId,
              CommandId: data.Command.CommandId
            };

            ssm.getCommandInvocation(getCommandParams, function(err, data) {
                if (data.Status === "Success") {
                    callback(null, data.StandardOutputContent);
                }
                else callback(data.StatusDetails, null)
            });
        }
    });
}
