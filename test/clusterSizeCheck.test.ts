import type { AutoScalingGroup } from '@aws-sdk/client-auto-scaling';
import { handler } from '../src/clusterSizeCheck';
import { getASG, launchNewInstance } from '../src/aws/autoscaling';
import { getSpecificInstance } from '../src/aws/ec2Instances';
import { Instance } from '../src/aws/types';
import { Elasticsearch } from '../src/elasticsearch/elasticsearch';
import { ElasticsearchNode } from '../src/elasticsearch/types';
import { AddNodeResponse } from '../src/utils/handlerInputs';

jest.mock('../src/aws/autoscaling', () => ({ getASG: jest.fn(), launchNewInstance: jest.fn() }));
jest.mock('../src/aws/ec2Instances', () => ({ getSpecificInstance: jest.fn() }));
jest.mock('../src/elasticsearch/elasticsearch');

const getGroup = getASG as jest.MockedFunction<typeof getASG>;
const getInstance = getSpecificInstance as jest.MockedFunction<typeof getSpecificInstance>;
const getClusterHealth = jest.fn();
const getElasticsearchNode = jest.fn();
type AsgFixture = AutoScalingGroup & {
    Instances: NonNullable<AutoScalingGroup['Instances']>;
    DesiredCapacity: number;
};

function fixture(crossAsg = false) {
    const sourceAsg = {
        name: 'source-asg',
        arn: 'arn:source',
        desiredCapacity: 2,
        instanceIds: ['i-target', 'i-peer'],
    };
    const destinationAsg = crossAsg
        ? {
              name: 'destination-asg',
              arn: 'arn:destination',
              desiredCapacity: 0,
              instanceIds: [],
          }
        : { ...sourceAsg };
    const event: AddNodeResponse & { traceID: string } = {
        destinationAsgName: destinationAsg.name,

        targetElasticSearchNode: new ElasticsearchNode(
            new Instance('i-target', new Date('2025-01-01'), '10.0.0.1', sourceAsg.name),
            'node-target',
            false
        ),
        traceID: 'rotation-2025-01-01-i-target',
        rotationPlan: {
            version: 1,
            sourceAsg,
            destinationAsg,
            expectedClusterSize: 3,

        },
    };
    const replacement = new Instance(
        'i-replacement',
        new Date('2024-01-01'),
        '10.0.0.2',
        destinationAsg.name
    );
    const asg: AsgFixture = {
        AutoScalingGroupName: destinationAsg.name,
        AutoScalingGroupARN: destinationAsg.arn,

        DesiredCapacity: crossAsg ? 1 : 2,
        Instances: ['i-replacement', ...(crossAsg ? [] : ['i-peer'])].map((InstanceId) => ({
            InstanceId,
            LifecycleState: 'InService',
            HealthStatus: 'Healthy',
            AvailabilityZone: 'eu-west-1a',
            ProtectedFromScaleIn: false,
        })),
    } as AsgFixture;
    getGroup.mockResolvedValue(asg);
    getInstance.mockImplementation(async (_ids, selector) => selector([replacement]));
    getClusterHealth.mockResolvedValue({ number_of_nodes: 3 });
    getElasticsearchNode.mockImplementation(
        async (instance) => new ElasticsearchNode(instance, 'node-replacement', false)
    );
    return { event, asg, replacement };
}

beforeEach(() => {
    jest.resetAllMocks();
    (Elasticsearch as jest.Mock).mockImplementation(() => ({
        getClusterHealth,
        getElasticsearchNode,
    }));
});

it.each([false, true])(
    'selects the baseline difference, not newest (cross-ASG=%s)',
    async (crossAsg) => {
        const { event, replacement } = fixture(crossAsg);
        const original = JSON.parse(JSON.stringify(event));

        const result = await handler(event);


        expect(getInstance).toHaveBeenCalledWith(['i-replacement'], expect.any(Function));
        expect(getElasticsearchNode).toHaveBeenCalledWith(replacement);
        expect(result).toEqual({
            ...event,
            newestElasticsearchNode: new ElasticsearchNode(replacement, 'node-replacement', false),
        });
        expect(result.rotationPlan).toBe(event.rotationPlan);
        expect(JSON.parse(JSON.stringify(event))).toEqual(original);
        expect(launchNewInstance).not.toHaveBeenCalled();
    }
);

it.each(['Detaching', 'InService'] as const)('waits for target %s, then retries', async (state) => {
    const { event, asg } = fixture();
    const serialized = JSON.parse(JSON.stringify(event));
    getGroup.mockResolvedValueOnce({
        ...asg,
        Instances: [
            ...asg.Instances,
            {
                ...asg.Instances[0],
                InstanceId: 'i-target',
                LifecycleState: state,
            },
        ],
    });

    await expect(handler(serialized)).rejects.toThrow(/waiting for detachment/i);
    expect(getInstance).not.toHaveBeenCalled();
    expect(Elasticsearch).not.toHaveBeenCalled();
    await expect(handler(serialized)).resolves.toHaveProperty(
        'newestElasticsearchNode.ec2Instance.id',
        'i-replacement'
    );
    expect(serialized).toEqual(JSON.parse(JSON.stringify(event)));
    expect(launchNewInstance).not.toHaveBeenCalled();
});

const drifts: Array<[string, (asg: AsgFixture) => void, RegExp]> = [
    [
        'no candidate',
        (asg) => {
            asg.Instances.shift();
        },
        /one replacement.*found 0/i,
    ],
    [
        'ambiguous candidates',
        (asg) => {
            asg.Instances.push({
                ...asg.Instances[0],
                InstanceId: 'i-other',
                HealthStatus: 'Unhealthy',
            });
        },
        /one replacement.*found 2/i,
    ],
    [
        'missing peer',
        (asg) => {
            asg.Instances.pop();
        },
        /membership drift.*i-peer/i,
    ],
    [
        'ARN drift',
        (asg) => {
            asg.AutoScalingGroupARN += '-recreated';
        },
        /identity\/ARN drift/i,
    ],
    [
        'capacity drift',
        (asg) => {
            asg.DesiredCapacity++;
        },
        /desired capacity/i,
    ],
    [
        'pending candidate',
        (asg) => {
            asg.Instances[0].LifecycleState = 'Pending';
        },
        /healthy and InService/i,
    ],
    [
        'unhealthy candidate',
        (asg) => {
            asg.Instances[0].HealthStatus = 'Unhealthy';
        },
        /healthy and InService/i,
    ],
];

it.each(drifts)('rejects %s before EC2 or ES lookup', async (_name, drift, error) => {
    const { event, asg } = fixture();
    drift(asg);

    await expect(handler(event)).rejects.toThrow(error);
    expect(getInstance).not.toHaveBeenCalled();
    expect(Elasticsearch).not.toHaveBeenCalled();
});

it('does not accept the target as a replacement in an originally empty destination', async () => {
    const { event, asg } = fixture(true);
    asg.Instances[0].InstanceId = 'i-target';

    await expect(handler(event)).rejects.toThrow(/Replacement i-target/i);
    expect(getInstance).not.toHaveBeenCalled();
});

it('rejects an EC2 identity mismatch using the real selector', async () => {
    const { event, replacement } = fixture();
    getInstance.mockImplementation(async (_ids, selector) =>
        selector([{ ...replacement, id: 'i-other' }])
    );

    await expect(handler(event)).rejects.toThrow(/Unexpected EC2 identity/i);
    expect(getClusterHealth).not.toHaveBeenCalled();
});

it('requires the planned ES node count before proceeding', async () => {
    const { event } = fixture();
    getClusterHealth.mockResolvedValue({ number_of_nodes: 999 });

    await expect(handler(event)).rejects.toThrow('Found 999 nodes but expected to find 3');
    expect(getElasticsearchNode).not.toHaveBeenCalled();
});

it('requires a plan before AWS or ES access', async () => {
    const { event } = fixture();
    Reflect.deleteProperty(event, 'rotationPlan');

    await expect(handler(event)).rejects.toThrow(/rotation plan/i);
    expect(getGroup).not.toHaveBeenCalled();
    expect(getInstance).not.toHaveBeenCalled();
    expect(Elasticsearch).not.toHaveBeenCalled();
});
