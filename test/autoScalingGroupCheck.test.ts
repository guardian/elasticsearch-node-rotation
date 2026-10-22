import { handler } from '../src/autoScalingGroupCheck';
import { getASG } from '../src/aws/autoscaling';
import type { AsgInput } from '../src/utils/handlerInputs';
import type { AutoScalingGroup } from '@aws-sdk/client-auto-scaling';

jest.mock('../src/aws/autoscaling');

const mockedGetASG = getASG as jest.MockedFunction<typeof getASG>;

describe('autoScalingGroupCheck handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const event: AsgInput = {
        destinationAsgName: 'test-asg',
        targetElasticSearchNode: {
            ec2Instance: {
                id: 'i-test',
                launchTime: new Date(),
                privateIp: '127.0.0.1',
                autoScalingGroupName: 'test-asg',
            },
            nodeId: 'node-test',
            isMasterEligible: true,
        },
    };

    it('allows healthy instances that are in service', async () => {
        mockedGetASG.mockResolvedValue({
            MaxSize: 2,
            Instances: [{ HealthStatus: 'Healthy', LifecycleState: 'InService' }],
        } as AutoScalingGroup);

        await expect(handler(event)).resolves.toBe(event);
    });

    it('fails when an instance is not healthy', async () => {
        mockedGetASG.mockResolvedValue({
            MaxSize: 2,
            Instances: [{ HealthStatus: 'Unhealthy', LifecycleState: 'InService' }],
        } as AutoScalingGroup);

        await expect(handler(event)).rejects.toThrow('ASG has 1 unhealthy instances');
    });

    it('fails when an instance is not in service', async () => {
        mockedGetASG.mockResolvedValue({
            MaxSize: 2,
            Instances: [{ HealthStatus: 'Healthy', LifecycleState: 'Pending' }],
        } as AutoScalingGroup);

        await expect(handler(event)).rejects.toThrow('ASG has 1 unhealthy instances');
    });
});
