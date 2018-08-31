import {AutoScaling} from 'aws-sdk';
import {AutoScalingGroupsType, DetachInstancesAnswer} from 'aws-sdk/clients/autoscaling';
import {Instance} from './types';

const AWS = require('aws-sdk');
const awsAutoscaling = new AWS.AutoScaling();

export function detachInstance(instance: Instance, asgName: string): Promise<DetachInstancesAnswer> {
    console.log(`Detaching ${instance.id} from ${asgName}. This should also bring a new node into the ASG`);
    const params = {
        InstanceIds: [ instance.id ],
        AutoScalingGroupName: asgName,
        ShouldDecrementDesiredCapacity: false
    };
    return awsAutoscaling.detachInstances(params).promise()
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