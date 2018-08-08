import {describeAsg} from './autoscaling'
import {Instance} from './types'

let AWS = require('aws-sdk');
let awsEc2 = new AWS.EC2();

type InstanceFilter = (instances: Instance[]) => Instance;

export function getInstances(asgName: string): Promise<string[]> {
    const autoScalingRequest = describeAsg(asgName);
    return autoScalingRequest.then(
        function (data) {
            const instances = data.AutoScalingGroups[0].Instances;
            return instances.map(instance => instance.InstanceId);
        },
        function (error) {
            console.log(error, error.stack, error.statusCode);
            return error;
        }
    )
}

export function getSpecificInstance(instanceIds: string[], instanceFilter: InstanceFilter): Promise<Instance> {
    console.log(`Fetching details for: ${instanceIds}`);
    const params = { InstanceIds: instanceIds };
    const requestPromise = awsEc2.describeInstances(params).promise();
    return requestPromise.then(
        function(data) {
            const instanceArrays = data.Reservations.map(instanceArrays => instanceArrays.Instances);
            const instances: Instance[] = instanceArrays.concat.apply([], instanceArrays).map(instance => new Instance(instance.InstanceId, instance.LaunchTime, instance.PrivateIpAddress));
            return instanceFilter(instances);
        },
        function (error) {
            console.log(error, error.stack, error.statusCode);
            return error;
        }
    )
}

