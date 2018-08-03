import {getDesiredCapacity} from '../src/addElasticsearchNode'
import {AutoScalingGroup, AutoScalingGroupsType} from 'aws-sdk/clients/autoscaling';

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

describe("getDesiredCapacity", () => {
    it("should throw an error if no ASG information is returned", () => {
        const mock: AutoScalingGroupsType = {
            AutoScalingGroups: []
        };
        expect(() => { getDesiredCapacity(mock); }).toThrow()
    });
});

describe("getDesiredCapacity", () => {
    it("should throw an error if information is returned about more than one ASG", () => {
        const mock: AutoScalingGroupsType = {
            AutoScalingGroups: [asg("asg123", 3), asg("asg124", 4)]
        }
        expect(() => { getDesiredCapacity(mock); }).toThrow()
    });
});

describe("getDesiredCapacity", () => {
    it("should return the desired capacity correctly if we get info about a single ASG", () => {
        const desiredCapacity = 3;
        const mock: AutoScalingGroupsType = {
            AutoScalingGroups: [asg("asg123", desiredCapacity)]
        }
        expect(getDesiredCapacity(mock)).toEqual(desiredCapacity);
    });
});