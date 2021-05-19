export class Instance {

    id: string;
    launchTime: Date;
    privateIp: string;
    autoScalingGroupName: string

    constructor(instanceId: string, launchTime: Date, privateIp: string, autoScalingGroupName: string) {
        this.id = instanceId;
        this.launchTime = launchTime;
        this.privateIp = privateIp;
        this.autoScalingGroupName = autoScalingGroupName
    }

}