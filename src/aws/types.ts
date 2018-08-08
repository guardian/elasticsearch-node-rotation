export class Instance {

    id: string;
    launchTime: Date;
    privateIp: string;

    constructor(instanceId: string, launchTime: Date, privateIp: string) {
        this.id = instanceId;
        this.launchTime = launchTime;
        this.privateIp = privateIp;
    }

}