import {describeAsg} from './autoscaling'
import {Instance} from './types'
import {AutoScalingGroupsType} from 'aws-sdk/clients/autoscaling';
import {DescribeInstancesResult, TerminateInstancesResult} from 'aws-sdk/clients/ec2';

const AWS = require('aws-sdk');
const awsEc2 = new AWS.EC2();

type InstanceFilter = (instances: Instance[]) => Instance;

export function getSpecificInstance(instanceIds: string[], instanceFilter: InstanceFilter): Promise<Instance> {
    console.log(`Fetching details for: ${instanceIds}`);
    const params = { InstanceIds: instanceIds };
    const requestPromise = awsEc2.describeInstances(params).promise();
    return requestPromise.then(
        function(data: DescribeInstancesResult) {
            const instanceArrays = data.Reservations.map(arrays => arrays.Instances);
            const instances: Instance[] = instanceArrays.concat.apply([], instanceArrays).map(instance => new Instance(instance.InstanceId, instance.LaunchTime, instance.PrivateIpAddress));
            return instanceFilter(instances);
        },
        function (error) {
            console.log(error, error.stack, error.statusCode);
            return error;
        }
    )
}

