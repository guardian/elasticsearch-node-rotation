let AWS = require('aws-sdk');

export function handler(event, context, callback) {
    console.log("Searching for oldest node...");
    getInstanceIds("asg123", callback);
}

let asg = new AWS.AutoScaling();
let ec2 = new AWS.EC2();

function getInstanceIds(asgName: string, callback) {
    let params = { AutoScalingGroupNames: [ asgName ] };
    asg.describeAutoScalingGroups(params, function(error, data) {
       if (error) {
           console.log(error, error.stack, error.statusCode);
       } else {
           let instances = data.AutoScalingGroups[0].Instances;
           let ids = instances.map(instance => instance.InstanceId);
           getOldestInstance(ids, callback);
       }
    })
}

function getOldestInstance(instanceIds: string[], callback) {
    let params = { InstanceIds: instanceIds };
    console.log(params);
    ec2.describeInstances(params, function (error, data) {
      if (error) {
          console.log(error, error.stack, error.statusCode)
      } else {
          console.log(data);
          let instanceArrays = data.Reservations.map(instanceArrays => instanceArrays.Instances);
          console.log(instanceArrays);
          let instances: Instance[] = instanceArrays.concat.apply([], instanceArrays).map(instance => new Instance(instance.InstanceId, instance.LaunchTime));
          console.log(`All instances are: ${instances.map(instance => instance.id)}`);
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




