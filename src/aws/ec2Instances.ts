import {Instance} from './types';
import {DescribeInstancesResult, Instance as EC2Instance} from 'aws-sdk/clients/ec2';
import {AWSError} from "aws-sdk/lib/error";

const AWS = require('aws-sdk');
const awsEc2 = new AWS.EC2();

type InstanceFilter = (instances: Instance[]) => Instance;

function buildInstance(instance: EC2Instance): Instance {
    const autoScalingGroupNameTag = instance.Tags!.find(({ Key }) => Key === "aws:autoscaling:groupName");
    if(!autoScalingGroupNameTag) {
        throw new Error(`Missing aws:autoscaling:groupName tag on instance ${instance.InstanceId}`);
    }

    const { InstanceId, LaunchTime, PrivateIpAddress } = instance;
    const asgTagValue = autoScalingGroupNameTag.Value;

    if(InstanceId && LaunchTime && PrivateIpAddress && asgTagValue) {
        return new Instance(InstanceId, LaunchTime, PrivateIpAddress, asgTagValue);
    } else {
        throw new Error(`We don't have enough information. All of these must be defined ${{InstanceId, LaunchTime, PrivateIpAddress, AsgGroupNameTagValue: asgTagValue}}`);
    }
}

function buildInstances(data: DescribeInstancesResult): Instance[] {
    return data.Reservations
        ? data.Reservations.map(arrays => arrays.Instances ?? [])
            .flat()
            .map(buildInstance)
        : [];
}

export async function getSpecificInstance(instanceIds: string[], instanceFilter: InstanceFilter): Promise<Instance> {
    console.log(`Fetching details for: ${instanceIds}`);
    const params = { InstanceIds: instanceIds };

    try {
        const data = await awsEc2.describeInstances(params).promise();
        const instances = buildInstances(data);
        return instanceFilter(instances);
    } catch (error) {
        const {stack, statusCode} = error as AWSError; // This isn't ideal. See https://github.com/aws/aws-sdk-js/issues/2611.
        console.log(error, stack, statusCode);
        return Promise.reject(error);
    }
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
