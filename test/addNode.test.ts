import { handler } from '../src/addNode';
import { launchNewInstance } from '../src/aws/autoscaling';
import { Instance } from '../src/aws/types';
import { Elasticsearch } from '../src/elasticsearch/elasticsearch';
import { ElasticsearchNode } from '../src/elasticsearch/types';
import { ClusterStatusResponse } from '../src/utils/handlerInputs';

jest.mock('../src/aws/autoscaling', () => ({ launchNewInstance: jest.fn() }));
jest.mock('../src/elasticsearch/elasticsearch');

const launch = launchNewInstance as jest.MockedFunction<typeof launchNewInstance>;
const updateRebalancingStatus = jest.fn();
const getClusterHealth = jest.fn();

function input(): ClusterStatusResponse & { traceID: string } {
    const sourceAsg = {
        name: 'source-asg',
        arn: 'arn:source',
        desiredCapacity: 2,
        instanceIds: ['i-target', 'i-peer'],
    };

    return {
        destinationAsgName: sourceAsg.name,
        targetElasticSearchNode: new ElasticsearchNode(
            new Instance('i-target', new Date('2025-01-01'), '10.0.0.1', sourceAsg.name),
            'node-target',
            false
        ),
        clusterStatus: 'green',
        traceID: 'rotation-2025-01-01-i-target',
        rotationPlan: {
            version: 1,
            sourceAsg,
            destinationAsg: { ...sourceAsg },
            expectedClusterSize: 3,
        },
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    (Elasticsearch as jest.Mock).mockImplementation(() => ({
        updateRebalancingStatus,
        getClusterHealth,
    }));
    updateRebalancingStatus.mockResolvedValue(true);
});

it('disables rebalancing before launch and preserves the saved plan', async () => {
    const event = JSON.parse(JSON.stringify(input()));
    const order: string[] = [];
    updateRebalancingStatus.mockImplementation(async () => {
        order.push('rebalance');
    });
    launch.mockImplementation(async () => {
        order.push('launch');
    });

    const result = await handler(event);

    expect(order).toEqual(['rebalance', 'launch']);
    expect(updateRebalancingStatus).toHaveBeenCalledWith('none');
    expect(launch).toHaveBeenCalledWith(
        event.targetElasticSearchNode.ec2Instance,
        event.destinationAsgName,
        event.rotationPlan
    );
    expect(result).toEqual(event);
    expect(result.rotationPlan).toBe(event.rotationPlan);
});

it('does not recalculate the saved cluster size', async () => {
    const event = input();
    getClusterHealth.mockResolvedValue({ number_of_nodes: 3 });

    const result = await handler(event);
    expect(result.rotationPlan.expectedClusterSize).toBe(3);
    expect(getClusterHealth).not.toHaveBeenCalled();
});

it('requires a plan before disabling rebalancing or launching', async () => {
    const event = input();
    Reflect.deleteProperty(event, 'rotationPlan');

    await expect(handler(event)).rejects.toThrow(/rotation plan/i);
    expect(Elasticsearch).not.toHaveBeenCalled();
    expect(updateRebalancingStatus).not.toHaveBeenCalled();
    expect(launch).not.toHaveBeenCalled();
});

it('does not launch when disabling rebalancing fails', async () => {
    updateRebalancingStatus.mockRejectedValue(new Error('rebalance failed'));

    await expect(handler(input())).rejects.toThrow('rebalance failed');
    expect(launch).not.toHaveBeenCalled();
});
