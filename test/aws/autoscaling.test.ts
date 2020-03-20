import {AutoScalingGroup, AutoScalingGroupsType} from 'aws-sdk/clients/autoscaling';
import {singleASG} from "../../src/autoScalingGroupCheck";

function asg(name: string, desiredCapacity: number): AutoScalingGroup {
    return {
        AutoScalingGroupName: name,
        MinSize: 3,
        MaxSize: 6,
        DesiredCapacity: desiredCapacity,
        DefaultCooldown: 1,
        AvailabilityZones: [],
        HealthCheckType: "none",
        CreatedTime: new Date()
    };
}

describe("singleASG", () => {
    it("should throw an error if more than one ASG is returned", () => {
        const multipleASGs: AutoScalingGroupsType = {
            AutoScalingGroups: [asg("asg1", 3), asg("asg2", 4)]
        };
        expect(() => { singleASG(multipleASGs.AutoScalingGroups) }).toThrow()
    });
});

describe("singleASG", () => {
    it("should throw an error if no ASG information is returned", () => {
        const mock: AutoScalingGroupsType = {
            AutoScalingGroups: []
        };
        expect(() => { singleASG(mock.AutoScalingGroups) }).toThrow()
    });
});

describe("DesiredCapacity", () => {
    it("should return the desired capacity correctly if we get info about a single ASG", () => {
        const desiredCapacity = 3;
        const mock: AutoScalingGroupsType = {
            AutoScalingGroups: [asg("asg123", desiredCapacity)]
        }
        expect(singleASG(mock.AutoScalingGroups).DesiredCapacity).toEqual(desiredCapacity);
    });
});
