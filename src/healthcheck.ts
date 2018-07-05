const AWS = require('aws-sdk');

export function handler(event, context, callback) {
    console.log("Checking ES cluster health");

    function wait() {
      return new Promise((resolve, reject) => {
        setTimeout(() => resolve("hello"), 2000)
      });
    }


    const ssm = new AWS.SSM();

    const sendCommandParams = {
        DocumentName: "AWS-RunShellScript",
        Parameters: {
            commands: [
              "curl localhost:9200/"
            ]
        },
        InstanceIds: [
            "i-03469a7182a46d6c6"
        ]
    };

    ssm.sendCommand(sendCommandParams, async function (err, data) {
        if (err) console.log(err, err.stack);
        else {
            console.log("command sent:")
            console.log(data)

            await wait()

            const getCommandParams = {
              InstanceId: "i-03469a7182a46d6c6",
              CommandId: data.Command.CommandId
            };

            ssm.getCommandInvocation(getCommandParams, function(err, data) {
                if (err) console.log(err, err.stack);
                else {
                    console.log("command details:")
                    console.log(data);

                    callback(null, "Success");
                }
            });
        }
    });
}
