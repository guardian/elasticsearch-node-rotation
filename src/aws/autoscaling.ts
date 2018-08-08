import {AutoScaling} from 'aws-sdk';
import {AutoScalingGroupsType} from 'aws-sdk/clients/autoscaling';

let AWS = require('aws-sdk');
let awsAutoscaling = new AWS.AutoScaling();

export function increaseAsgSize(asgName: string, originalAsgSize: number): Promise<{}> {
    let newDesiredCapacity = originalAsgSize + 1;
    console.log(`Increasing the size of ${asgName} from ${originalAsgSize} to ${newDesiredCapacity}`);
    let params = {
        AutoScalingGroupName: asgName,
        DesiredCapacity: newDesiredCapacity
    };
    return awsAutoscaling.setDesiredCapacity(params).promise();
}

export function terminateOldestInstance(instanceToTerminate: string): Promise<AutoScaling.Types.ActivityType> {
    console.log(`Terminating instance id: ${instanceToTerminate} and decreasing desired ASG capacity`);
    let params = {
        InstanceId: instanceToTerminate,
        ShouldDecrementDesiredCapacity: true
    };
    return awsAutoscaling.terminateInstanceInAutoScalingGroup(params).promise();
}

export function describeAsg(asgName: string): Promise<AutoScaling.Types.AutoScalingGroupsType> {
    let params = { AutoScalingGroupNames: [ asgName ] };
    return awsAutoscaling.describeAutoScalingGroups(params).promise();
}

export function getDesiredCapacity(asgInfo: AutoScalingGroupsType): number {
    const asgsInResponse = asgInfo.AutoScalingGroups.length;
    if (asgsInResponse !== 1) {
        throw `Expected information about a single ASG, but got ${asgsInResponse}`;
    } else {
        return asgInfo.AutoScalingGroups[0].DesiredCapacity;
    }
}