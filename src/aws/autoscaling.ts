import {Instance} from './types';
import {retry} from '../utils/helperFunctions';
import {
    AttachInstancesCommand,
    AutoScaling, AutoScalingGroup, DescribeAutoScalingGroupsCommand, DescribeAutoScalingGroupsCommandOutput,
    DetachInstancesCommand,
    DetachInstancesCommandOutput,
    SetDesiredCapacityCommand,
    TerminateInstanceInAutoScalingGroupCommand,
    TerminateInstanceInAutoScalingGroupCommandOutput
} from "@aws-sdk/client-auto-scaling";

const awsAutoscaling = new AutoScaling();

export async function launchNewInstance(instance: Instance, asgName: string): Promise<DetachInstancesCommandOutput> {
    if (instance.autoScalingGroupName === asgName) {
        console.log(`Detaching ${instance.id} from ${asgName}. This should also bring a new instance into the ASG`);
        const params = {
            InstanceIds: [ instance.id ],
            AutoScalingGroupName: asgName,
            ShouldDecrementDesiredCapacity: false
        };
        const req = new DetachInstancesCommand(params);

        return retry(() => awsAutoscaling.send(req), `detaching instance ${instance.id}`, 5)
    } else {
        console.log(`Launch new instance to new ASG ${asgName}.`);
        const asgs = await retry(
            () => awsAutoscaling.send(new DescribeAutoScalingGroupsCommand({
                AutoScalingGroupNames: [asgName]
            })),
            `getting current capacity in ${asgName}`,
            5,
        );
        const capacity = asgs.AutoScalingGroups[0].DesiredCapacity;

        return retry(
            () => awsAutoscaling.send(new SetDesiredCapacityCommand({
                AutoScalingGroupName: asgName,
                DesiredCapacity: capacity + 1,
            })),
            `launching new instance in ${asgName}`,
            5,
        );
    }
}

export function attachInstance(instance: Instance, asgName: string): Promise<{}> {
    console.log(`Attaching ${instance.id} to ${asgName}.`);
    const params = {
        InstanceIds: [ instance.id ],
        AutoScalingGroupName: asgName
    };
    const req = new AttachInstancesCommand(params)
    return retry(() => awsAutoscaling.send(req), `attaching instance ${instance.id}`, 5)
}

export function terminateInstanceInASG(instance: Instance): Promise<TerminateInstanceInAutoScalingGroupCommandOutput> {
    console.log(`Terminating instance ${instance.id}`);
    const params = {
        InstanceId: instance.id,
        ShouldDecrementDesiredCapacity: true
    };
    const req = new TerminateInstanceInAutoScalingGroupCommand(params);

    return retry(() => awsAutoscaling.send(req), `terminating instance ${instance.id}`, 5)
}

export function describeAsg(asgName: string): Promise<DescribeAutoScalingGroupsCommandOutput> {
    const req = new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [ asgName ] });
    return retry(() => awsAutoscaling.send(req), `describing ASG ${asgName}`, 5)
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

export async function getASGsByTag(tagKey: string, tagValue: string): Promise<AutoScalingGroup[]> {
    return (await retry<DescribeAutoScalingGroupsCommandOutput>(() => awsAutoscaling.describeAutoScalingGroups({
          Filters: [
              { "Name": `tag${tagValue ? `:${tagKey}` : "-key"}`, Values: [tagValue || tagKey] }
          ]
      }), `finding ASGs with tag '${tagKey}' equal to ${tagValue}`, 5)
    ).AutoScalingGroups;
}
