let AWS = require('aws-sdk');

export function handler(event, context, callback) {
    let asg: string = process.env.ASG_NAME;
    console.log(`Searching for oldest node in ${asg}`);
    identifyOldestInstance(asg, callback);
}

let awsAutoscaling = new AWS.AutoScaling();
let awsEc2 = new AWS.EC2();

function identifyOldestInstance(asgName: string, callback) {
    let params = { AutoScalingGroupNames: [ asgName ] };
    awsAutoscaling.describeAutoScalingGroups(params, function(error, data) {
       if (error) {
           console.log(error, error.stack, error.statusCode);
       } else {
           let instances = data.AutoScalingGroups[0].Instances;
           let ids = instances.map(instance => instance.InstanceId);
           getOldestInstanceId(ids, callback);
       }
    })
}

function getOldestInstanceId(instanceIds: string[], callback) {
    console.log(`Fetching details for: ${instanceIds}`);
    let params = { InstanceIds: instanceIds };
    awsEc2.describeInstances(params, function (error, data) {
      if (error) {
          console.log(error, error.stack, error.statusCode)
      } else {
          let instanceArrays = data.Reservations.map(instanceArrays => instanceArrays.Instances);
          let instances: Instance[] = instanceArrays.concat.apply([], instanceArrays).map(instance => new Instance(instance.InstanceId, instance.LaunchTime));
          let sortedInstances: Instance[] = instances.sort(function(a,b){return a.launchTime.getTime() - b.launchTime.getTime()});
          let oldestInstance: Instance = sortedInstances[0];
          console.log(`Oldest instance ${oldestInstance.id} was launched at ${oldestInstance.launchTime}`);
          callback(null, { "oldestInstance": oldestInstance.id})
      }
    });
}

class Instance {

    id: string;
    launchTime: Date;

    constructor(instanceId: string, launchTime: Date) {
        this.id = instanceId;
        this.launchTime = launchTime
    }

}




