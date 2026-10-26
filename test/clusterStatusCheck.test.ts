import type { AutoScalingGroup } from '@aws-sdk/client-auto-scaling';
import { handler } from '../src/clusterStatusCheck';
import { getASG, launchNewInstance } from '../src/aws/autoscaling';
import { Instance } from '../src/aws/types';
import { Elasticsearch } from '../src/elasticsearch/elasticsearch';
import type { AsgInput } from '../src/utils/handlerInputs';

jest.mock('../src/aws/autoscaling');
jest.mock('../src/elasticsearch/elasticsearch');

const getGroup = getASG as jest.MockedFunction<typeof getASG>;
const getClusterHealth = jest.fn();

type AsgFixture = AutoScalingGroup & {
    DesiredCapacity: number;
    Instances: NonNullable<AutoScalingGroup['Instances']>;
};

function input(destinationAsgName = 'source'): AsgInput {
    return {
        destinationAsgName,
        targetElasticSearchNode: {
            ec2Instance: new Instance('i-target', new Date('2025-01-01'), '10.0.0.1', 'source'),
            nodeId: 'node-target',
            isMasterEligible: false,
        },
    };
}

function group(name: string, ids: string[]): AsgFixture {
    return {
        AutoScalingGroupName: name,
        AutoScalingGroupARN: `arn:${name}`,
        DesiredCapacity: ids.length,
        Instances: ids.map((InstanceId) => ({
            InstanceId,
            HealthStatus: 'Healthy',
            LifecycleState: 'InService',
        })),
    } as AsgFixture;
}

beforeEach(() => {
    jest.resetAllMocks();
    (Elasticsearch as jest.Mock).mockImplementation(() => ({
        getClusterHealth,
    }));
    getClusterHealth.mockResolvedValue({ status: 'green', number_of_nodes: 2 });
    getGroup.mockImplementation(async (name) =>
        group(name, name === 'source' ? ['i-target', 'i-peer'] : [])
    );
});

it('saves a serializable baseline before any capacity mutation, preserving metadata', async () => {
    const event = { ...input(), traceID: 'rotation-1' };
    const result = await handler(event);
    const sourceAsg = {
        name: 'source',
        arn: 'arn:source',
        desiredCapacity: 2,
        instanceIds: ['i-target', 'i-peer'],
    };
    expect(result).toEqual({
        ...event,
        clusterStatus: 'green',
        rotationPlan: {
            version: 1,
            sourceAsg,
            destinationAsg: sourceAsg,
            expectedClusterSize: 3,
        },
    });
    expect(getGroup).toHaveBeenCalledTimes(1);
    expect(launchNewInstance).not.toHaveBeenCalled();
    expect(event).not.toHaveProperty('rotationPlan');
});

it('records a separate empty destination for cross-ASG rotation', async () => {
    const { rotationPlan } = await handler(input('destination'));
    expect(rotationPlan.sourceAsg.desiredCapacity).toBe(2);
    expect(rotationPlan.destinationAsg).toEqual({
        name: 'destination',
        arn: 'arn:destination',
        desiredCapacity: 0,
        instanceIds: [],
    });
});

it('does not rebuild an existing plan from changed observations', async () => {
    const saved = JSON.parse(JSON.stringify(await handler(input())));
    getGroup.mockClear();
    getClusterHealth.mockResolvedValue({ status: 'yellow', number_of_nodes: 10 });

    expect(await handler(saved)).toEqual({ ...saved, clusterStatus: 'yellow' });
    expect(getGroup).not.toHaveBeenCalled();
});

const unstableGroups: Array<[string, (asg: AsgFixture) => void]> = [
    [
        'capacity mismatch',
        (asg) => {
            asg.DesiredCapacity++;
        },
    ],
    [
        'unhealthy peer',
        (asg) => {
            asg.Instances[1].HealthStatus = 'Unhealthy';
        },
    ],
    [
        'standby target',
        (asg) => {
            asg.Instances[0].LifecycleState = 'Standby';
        },
    ],
    [
        'weighted instances',
        (asg) => {
            asg.Instances[0].WeightedCapacity = '2';
        },
    ],
    [
        'non-instance capacity units',
        (asg) => {
            asg.DesiredCapacityType = 'vcpu';
        },
    ],
];

it.each(unstableGroups)('refuses to plan with %s', async (_name, invalidate) => {
    const asg = group('source', ['i-target', 'i-peer']);
    invalidate(asg);
    getGroup.mockResolvedValue(asg);

    await expect(handler(input())).rejects.toThrow('Cannot plan rotation');
    expect(launchNewInstance).not.toHaveBeenCalled();
});

it('does not produce a plan when baseline health is invalid', async () => {
    getClusterHealth.mockResolvedValueOnce({ status: 'green', number_of_nodes: 0 });
    await expect(handler(input())).rejects.toThrow('invalid cluster health');
});
