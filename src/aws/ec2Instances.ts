import {Instance} from './types';

import {
    DescribeInstancesCommandOutput,
    Instance as EC2Instance,
    EC2,
    DescribeInstancesCommand
} from "@aws-sdk/client-ec2";
const awsEc2 = new EC2();

type InstanceFilter = (instances: Instance[]) => Instance;

function buildInstance(instance: EC2Instance): Instance {
    const autoScalingGroupNameTag = instance.Tags!.find(({ Key }) => Key === "aws:autoscaling:groupName");
    if(!autoScalingGroupNameTag) {
        throw new Error(`Missing aws:autoscaling:groupName tag on instance ${instance.InstanceId}`);
    }

    return new Instance(instance.InstanceId, instance.LaunchTime, instance.PrivateIpAddress, autoScalingGroupNameTag!.Value);
}

function buildInstances(data: DescribeInstancesCommandOutput): Instance[] {
    const instanceArrays = data.Reservations.map(arrays => arrays.Instances);
    return instanceArrays.concat.apply([], instanceArrays).map(buildInstance);
}

export async function getSpecificInstance(instanceIds: string[], instanceFilter: InstanceFilter): Promise<Instance> {
    console.log(`Fetching details for: ${instanceIds}`);
    const req = new DescribeInstancesCommand({ InstanceIds: instanceIds });
    try {
        const response = await awsEc2.send(req);
        return instanceFilter(buildInstances(response));
    } catch(err) {
        console.log(err, err.stack, err.statusCode);
        return Promise.reject(err);
    }
}

export async function getInstancesByTag(tagKey: string, tagValue?: string): Promise<Instance[]> {
    console.log(`Finding EC2 instances that have tag ${tagKey}`);

    async function _getInstancesByTag(acc: Instance[] = [], nextToken?: string): Promise<Instance[]> {
        const req = new DescribeInstancesCommand({
            MaxResults: 1000,
            NextToken: nextToken,
            Filters: [
                { "Name": "instance-state-name", Values: ["running"] },
                { "Name": `tag${tagValue ? `:${tagKey}` : "-key"}`, Values: [tagValue || tagKey] }
            ]
        });

        const response = await awsEc2.send(req);

        const instances = buildInstances(response);
        const allInstances = acc.concat(instances);

        if(response.NextToken) {
            return await _getInstancesByTag(allInstances, response.NextToken);
        } else {
            return allInstances;
        }
    }

    return _getInstancesByTag();
}
