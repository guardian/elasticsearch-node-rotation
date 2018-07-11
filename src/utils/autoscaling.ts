let AWS = require('aws-sdk');
let awsAutoscaling = new AWS.AutoScaling();

export function increaseAsgSize(asgName: string, originalAsgSize: number) {
    let newDesiredCapacity = originalAsgSize + 1;
    console.log(`Increasing the size of ${asgName} from ${originalAsgSize} to ${newDesiredCapacity}`);
    let params = {
        AutoScalingGroupName: asgName,
        DesiredCapacity: newDesiredCapacity
    };
    return awsAutoscaling.setDesiredCapacity(params).promise();
}

export function terminateOldestInstance(instanceToTerminate: string) {
    console.log(`Terminating instance id: ${instanceToTerminate} and decreasing desired ASG capacity`);
    let params = {
        InstanceId: instanceToTerminate,
        ShouldDecrementDesiredCapacity: true
    };
    return awsAutoscaling.terminateInstanceInAutoScalingGroup(params).promise();
}

export function describeAsg(asgName: string) {
    let params = { AutoScalingGroupNames: [ asgName ] };
    return awsAutoscaling.describeAutoScalingGroups(params).promise();
}