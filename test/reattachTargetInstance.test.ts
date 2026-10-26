import { handler } from '../src/reattachTargetInstance';
import { attachInstance } from '../src/aws/autoscaling';
import { Instance } from '../src/aws/types';
import { ElasticsearchNode } from '../src/elasticsearch/types';
import { RotationPlan, TargetAndNewNodeResponse } from '../src/utils/handlerInputs';

jest.mock('../src/aws/autoscaling', () => ({ attachInstance: jest.fn() }));

function input(crossAsg = false): TargetAndNewNodeResponse & {
    rotationPlan: RotationPlan;
    traceID: string;
} {
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
    return {
        destinationAsgName: destinationAsg.name,
        traceID: 'rotation-2025-01-01-i-target',
        targetElasticSearchNode: new ElasticsearchNode(
            new Instance('i-target', new Date('2025-01-01'), '10.0.0.1', sourceAsg.name),
            'node-target',
            false
        ),
        newestElasticsearchNode: new ElasticsearchNode(
            new Instance('i-replacement', new Date('2024-01-01'), '10.0.0.2', destinationAsg.name),
            'node-replacement',
            false
        ),
        rotationPlan: {
            version: 1,
            sourceAsg,
            destinationAsg,
            expectedClusterSize: 3,
        },
    };
}

beforeEach(() => jest.resetAllMocks());

it('passes the exact selected replacement and plan to attach, preserving serialized metadata', async () => {
    const event = JSON.parse(JSON.stringify(input()));

    await expect(handler(event)).resolves.toBe(event);

    expect(attachInstance).toHaveBeenCalledTimes(1);
    expect(attachInstance).toHaveBeenCalledWith(
        event.targetElasticSearchNode.ec2Instance,
        event.destinationAsgName,
        event.rotationPlan,
        'i-replacement'
    );
});

it('skips attachment for cross-ASG rotations', async () => {
    const event = JSON.parse(JSON.stringify(input(true)));

    await expect(handler(event)).resolves.toBe(event);
    expect(attachInstance).not.toHaveBeenCalled();
});

it.each([false, true])(
    'requires a plan before attachment or cross-ASG skip (%s)',
    async (crossAsg) => {
        const event = input(crossAsg);
        Reflect.deleteProperty(event, 'rotationPlan');

        await expect(handler(event)).rejects.toThrow(/rotation plan/i);
        expect(attachInstance).not.toHaveBeenCalled();
    }
);
