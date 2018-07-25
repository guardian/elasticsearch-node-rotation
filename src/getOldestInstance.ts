import {describeAsg} from './utils/autoscaling'

let AWS = require('aws-sdk');

export async function handler(event) {
    return new Promise((resolve, reject) => {
        const asg: string = process.env.ASG_NAME;
        console.log(`Searching for oldest node in ${asg}`);
        getInstances(asg)
            .then(ids => getOldestInstanceId(ids))
            .then(oldestInstance => {
                resolve(oldestInstance.id);
            })
            .catch(error => reject(error))
    })

}

let awsEc2 = new AWS.EC2();

function getInstances(asgName: string): Promise<string[]> {
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

function getOldestInstanceId(instanceIds: string[]): Promise<Instance> {
    console.log(`Fetching details for: ${instanceIds}`);
    const params = { InstanceIds: instanceIds };
    const requestPromise = awsEc2.describeInstances(params).promise();
    return requestPromise.then(
        function(data) {
            const instanceArrays = data.Reservations.map(instanceArrays => instanceArrays.Instances);
            const instances: Instance[] = instanceArrays.concat.apply([], instanceArrays).map(instance => new Instance(instance.InstanceId, instance.LaunchTime));
            return findOldestInstance(instances);
        },
        function (error) {
            console.log(error, error.stack, error.statusCode);
            return error;
        }
    )
}

function findOldestInstance(instances: Instance[]): Instance {
    const sortedInstances: Instance[] = instances.sort(function(a,b){return a.launchTime.getTime() - b.launchTime.getTime()});
    const oldestInstance: Instance = sortedInstances[0];
    console.log(`Oldest instance ${oldestInstance.id} was launched at ${oldestInstance.launchTime}`);
    return oldestInstance;
}

class Instance {

    id: string;
    launchTime: Date;

    constructor(instanceId: string, launchTime: Date) {
        this.id = instanceId;
        this.launchTime = launchTime
    }

}

export const _ = { findOldestInstance, Instance };




