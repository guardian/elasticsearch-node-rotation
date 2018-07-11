let AWS = require('aws-sdk');

export async function handler(event) {
    return new Promise((resolve, reject) => {
        let asg: string = process.env.ASG_NAME;
        console.log(`Searching for oldest node in ${asg}`);
        getInstances(asg)
            .then(ids => getOldestInstanceId(ids))
            .then(oldestInstance => {
                resolve({"oldestInstance": oldestInstance.id});
            })
            .catch(error => reject(error))
    })

}

let awsAutoscaling = new AWS.AutoScaling();
let awsEc2 = new AWS.EC2();

function getInstances(asgName: string): Promise<string[]> {
    let params = { AutoScalingGroupNames: [ asgName ] };
    let requestPromise = awsAutoscaling.describeAutoScalingGroups(params).promise();
    return requestPromise.then(
        function (data) {
            let instances = data.AutoScalingGroups[0].Instances;
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
    let params = { InstanceIds: instanceIds };
    let requestPromise = awsEc2.describeInstances(params).promise();
    return requestPromise.then(
        function(data) {
            let instanceArrays = data.Reservations.map(instanceArrays => instanceArrays.Instances);
            let instances: Instance[] = instanceArrays.concat.apply([], instanceArrays).map(instance => new Instance(instance.InstanceId, instance.LaunchTime));
            let sortedInstances: Instance[] = instances.sort(function(a,b){return a.launchTime.getTime() - b.launchTime.getTime()});
            let oldestInstance: Instance = sortedInstances[0];
            console.log(`Oldest instance ${oldestInstance.id} was launched at ${oldestInstance.launchTime}`);
            return oldestInstance;
        },
        function (error) {
            console.log(error, error.stack, error.statusCode);
            return error;
        }
    )
}

class Instance {

    id: string;
    launchTime: Date;

    constructor(instanceId: string, launchTime: Date) {
        this.id = instanceId;
        this.launchTime = launchTime
    }

}




