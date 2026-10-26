import { handler } from '../src/migrateShards';
import { Elasticsearch } from '../src/elasticsearch/elasticsearch';
import { Instance } from '../src/aws/types';
import { TargetAndNewNodeResponse } from '../src/utils/handlerInputs';

jest.mock('../src/elasticsearch/elasticsearch');
const applyMigrationSettings = jest.fn();

function input(): TargetAndNewNodeResponse {
    const target = {
        ec2Instance: new Instance('i-target', new Date('2025-01-01'), '10.0.0.1', 'source'),
        nodeId: 'node-target',
        isMasterEligible: false,
    };
    const sourceAsg = {
        name: 'source', arn: 'arn:source', desiredCapacity: 1, instanceIds: ['i-target'],
    };
    return {
        destinationAsgName: 'source',
        targetElasticSearchNode: target,
        newestElasticsearchNode: { ...target, nodeId: 'node-replacement' },
        rotationPlan: {
            version: 1, sourceAsg, destinationAsg: sourceAsg, expectedClusterSize: 2,
            clusterSettings: {
                rebalanceEnable: null, allocationExcludeIp: null, persistentAllocationExcludeIp: '10.0.0.9',
            },
        },
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    (Elasticsearch as jest.Mock).mockImplementation(() => ({ applyMigrationSettings }));
    applyMigrationSettings.mockResolvedValue(undefined);
});

it('uses the saved settings baseline and preserves the event', async () => {
    const event = { ...input(), traceID: 'rotation-1' };
    expect(await handler(event)).toBe(event);
    expect(Elasticsearch).toHaveBeenCalledWith('i-target');
    expect(applyMigrationSettings).toHaveBeenCalledWith(event.rotationPlan.clusterSettings, '10.0.0.1');
});

it.each(['missing plan', 'PR1 plan', 'invalid settings', 'invalid plan'])('rejects %s before creating a client', async (failure) => {
    const event = input();
    if (failure === 'missing plan') delete event.rotationPlan;
    if (failure === 'PR1 plan') delete event.rotationPlan.clusterSettings;
    if (failure === 'invalid settings') delete event.rotationPlan.clusterSettings.rebalanceEnable;
    if (failure === 'invalid plan') event.rotationPlan.expectedClusterSize = 0;
    await expect(handler(event)).rejects.toThrow(/rotation plan|cluster settings baseline/i);
    expect(Elasticsearch).not.toHaveBeenCalled();
    expect(applyMigrationSettings).not.toHaveBeenCalled();
});

it('propagates migration conflicts without returning success', async () => {
    applyMigrationSettings.mockRejectedValue(new Error('Cluster settings conflict'));
    await expect(handler(input())).rejects.toThrow('Cluster settings conflict');
});
