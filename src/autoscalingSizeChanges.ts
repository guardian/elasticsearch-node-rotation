let AWS = require('aws-sdk');

let awsAutoscaling = new AWS.AutoScaling();

export function increaseAsgSize(asgName: string, originalAsgSize: number) {
    let newDesiredCapacity = originalAsgSize + 1;
    console.log(`Increasing the size of ${asgName} from ${originalAsgSize} to ${newDesiredCapacity}`);
    let params = {
        AutoScalingGroupName: asgName,
        DesiredCapacity: newDesiredCapacity
    };
    awsAutoscaling.setDesiredCapacity(params, function(error, data) {
        if (error) {
            console.log(error, error.stack, error.statusCode);
        } else {
            console.log(data);
        }
    });
}

export function terminateOldestInstance(instanceToTerminate: string) {
    console.log(`Terminating instance id: ${instanceToTerminate} and decreasing desired ASG capacity`);
    let params = {
        InstanceId: instanceToTerminate,
        ShouldDecrementDesiredCapacity: true
    };
    awsAutoscaling.terminateInstanceInAutoScalingGroup(params, function(error, data) {
        if (error) {
            console.log(error, error.stack, error.statusCode);
        } else {
            console.log(data);
        }
    })
}