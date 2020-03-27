import {AutoScaling} from 'aws-sdk';
import {AutoScalingGroup, DetachInstancesAnswer} from 'aws-sdk/clients/autoscaling';
import {Instance} from './types';
import {retry} from '../utils/helperFunctions';

const AWS = require('aws-sdk');
const awsAutoscaling = new AWS.AutoScaling();

export function detachInstance(instance: Instance, asgName: string): Promise<DetachInstancesAnswer> {
    console.log(`Detaching ${instance.id} from ${asgName}. This should also bring a new instance into the ASG`);
    const params = {
        InstanceIds: [ instance.id ],
        AutoScalingGroupName: asgName,
        ShouldDecrementDesiredCapacity: false
    };
    return retry(() => awsAutoscaling.detachInstances(params).promise(), `detaching instance ${instance.id}`, 5)
}

export function attachInstance(instance: Instance, asgName: string): Promise<{}> {
    console.log(`Attaching ${instance.id} to ${asgName}.`);
    const params = {
        InstanceIds: [ instance.id ],
        AutoScalingGroupName: asgName
    };
    return retry(() => awsAutoscaling.attachInstances(params).promise(), `attaching instance ${instance.id}`, 5)
}

export function terminateInstanceInASG(instance: Instance): Promise<AutoScaling.Types.ActivityType> {
    console.log(`Terminating instance ${instance.id}`);
    const params = { 
        InstanceId: instance.id,
        ShouldDecrementDesiredCapacity: true 
    };
    return retry(() => awsAutoscaling.terminateInstanceInAutoScalingGroup(params).promise(), `terminating instance ${instance.id}`, 5)
}

export function describeAsg(asgName: string): Promise<AutoScaling.Types.AutoScalingGroupsType> {
    const params = { AutoScalingGroupNames: [ asgName ] };
    return retry(() => awsAutoscaling.describeAutoScalingGroups(params).promise(), `describing ASG ${asgName}`, 5)
}

export async function getASG(asgName: string): Promise<AutoScalingGroup> {
    const groups = await describeAsg(asgName)
    const groupNumber = groups.AutoScalingGroups.length;
    if (groupNumber !== 1) {
        throw new Error(`Expected single ASG, but got ${groupNumber}`)
    } else {
        return groups.AutoScalingGroups[0]
    }
}
