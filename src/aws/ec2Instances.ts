import {Instance} from './types';
import {DescribeInstancesResult, Instance as EC2Instance} from 'aws-sdk/clients/ec2';

const AWS = require('aws-sdk');
const awsEc2 = new AWS.EC2();

type InstanceFilter = (instances: Instance[]) => Instance;

function buildInstance(instance: EC2Instance): Instance {
    const autoScalingGroupNameTag = instance.Tags!.find(({ Key }) => Key === "aws:autoscaling:groupName");
    if(!autoScalingGroupNameTag) {
        throw new Error(`Missing aws:autoscaling:groupName tag on instance ${instance.InstanceId}`);
    }

    return new Instance(instance.InstanceId, instance.LaunchTime, instance.PrivateIpAddress, autoScalingGroupNameTag!.Value);
}

function buildInstances(data: DescribeInstancesResult): Instance[] {
    const instanceArrays = data.Reservations.map(arrays => arrays.Instances);
    const instances: Instance[] = instanceArrays.concat.apply([], instanceArrays).map(buildInstance);

    return instances;
}

export function getSpecificInstance(instanceIds: string[], instanceFilter: InstanceFilter): Promise<Instance> {
    console.log(`Fetching details for: ${instanceIds}`);
    const params = { InstanceIds: instanceIds };
    const requestPromise = awsEc2.describeInstances(params).promise();
    return requestPromise.then(
        function(data: DescribeInstancesResult) {
            const instances = buildInstances(data);
            return instanceFilter(instances);
        },
        function (error) {
            console.log(error, error.stack, error.statusCode);
            return error;
        }
    )
}

export async function getInstancesByTag(tagKey: string, tagValue?: string): Promise<Instance[]> {
    console.log(`Finding EC2 instances that have tag ${tagKey}`);

    async function _getInstancesByTag(acc: Instance[] = [], nextToken?: string): Promise<Instance[]> {
        const params = {
            MaxResults: 1000,
            NextToken: nextToken,
            Filters: [
                { "Name": "instance-state-name", Values: ["running"] },
                { "Name": `tag${tagValue ? `:${tagKey}` : "-key"}`, Values: [tagValue || tagKey] }
            ]
        };

        const response = await awsEc2.describeInstances(params).promise();

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
