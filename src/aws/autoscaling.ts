import {AutoScaling} from 'aws-sdk';
import {AutoScalingGroupsType} from 'aws-sdk/clients/autoscaling';

const AWS = require('aws-sdk');
const awsAutoscaling = new AWS.AutoScaling();

export function increaseAsgSize(asgName: string, originalAsgSize: number): Promise<{}> {
    const newDesiredCapacity = originalAsgSize + 1;
    console.log(`Increasing the size of ${asgName} from ${originalAsgSize} to ${newDesiredCapacity}`);
    const params = {
        AutoScalingGroupName: asgName,
        DesiredCapacity: newDesiredCapacity
    };
    return awsAutoscaling.setDesiredCapacity(params).promise();
}

export function terminateOldestInstance(instanceToTerminate: string): Promise<AutoScaling.Types.ActivityType> {
    console.log(`Terminating instance id: ${instanceToTerminate} and decreasing desired ASG capacity`);
    const params = {
        InstanceId: instanceToTerminate,
        ShouldDecrementDesiredCapacity: true
    };
    return awsAutoscaling.terminateInstanceInAutoScalingGroup(params).promise();
}

export function describeAsg(asgName: string): Promise<AutoScaling.Types.AutoScalingGroupsType> {
    const params = { AutoScalingGroupNames: [ asgName ] };
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