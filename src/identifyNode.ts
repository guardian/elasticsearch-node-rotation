let AWS = require('aws-sdk');

export function handler(event, context, callback) {
    console.log("Searching for oldest node...");
    describeAsg("asg123");
    callback(null, "Success");
}

let asg = new AWS.AutoScaling();

function describeAsg(asgName: string) {
    let params = { AutoScalingGroupNames: [ asgName ] };
    asg.describeAutoScalingGroups(params, function(error, data) {
       if (error) console.log(error, error.stack, error.statusCode);
       else console.log(data);
    })
}



