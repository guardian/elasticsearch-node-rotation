import { execFileSync } from 'child_process';
import { Elasticsearch } from '../src/elasticsearch/elasticsearch';
import { Instance } from '../src/aws/types';
import { ElasticsearchNode } from '../src/elasticsearch/types';
import { ClusterSettingsSnapshot } from '../src/utils/handlerInputs';
import { ssmCommand } from '../src/utils/ssmCommand';

jest.mock('../src/utils/ssmCommand');

const rebalance = 'cluster.routing.rebalance.enable';
const exclusion = 'cluster.routing.allocation.exclude._ip';
const targetIp = '10.0.0.1';
const baseline: ClusterSettingsSnapshot = {
    rebalanceEnable: null,
    allocationExcludeIp: null,
    persistentAllocationExcludeIp: '10.0.0.9',
};
const migrating = { ...baseline, rebalanceEnable: 'all', allocationExcludeIp: '10.0.0.9,10.0.0.1' };
let client: Elasticsearch;

beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetAllMocks();
    client = new Elasticsearch('i-survivor');
});

it('shell-quotes arbitrary JSON without interpreting apostrophes or shell expressions', async () => {
    const payload = { transient: { [exclusion]: "operator's $(printf injected); `printf injected` \\ \n" } };
    (ssmCommand as jest.Mock).mockImplementation(async (command: string) =>
        execFileSync('/bin/sh', ['-c', `curl() { for arg do :; done; printf '%s' "$arg"; }; ${command}`]).toString()
    );
    expect(await client.execute('/_cluster/settings', payload)).toEqual(payload);
    expect(ssmCommand).toHaveBeenCalledWith(expect.any(String), 'i-survivor');
});

it.each([
    [{ roles: ['master', 'data'], settings: {} }, true],
    [{ roles: ['data'], settings: { node: { master: 'true' } } }, false],
    [{ settings: { node: { master: 'false' } } }, false],
    [{ settings: {} }, true],
])('identifies current and legacy master roles: %j', async (node, eligible) => {
    jest.spyOn(client, 'execute').mockResolvedValue({ _nodes: { total: 1 }, nodes: { 'node-id': node } });
    const instance = new Instance('i-target', new Date('2025-01-01'), targetIp, 'source');
    expect((await client.getElasticsearchNode(instance)).isMasterEligible).toBe(eligible);
});

it('reads flattened transient settings, preserving strings, empty strings and absent values', async () => {
    const execute = jest.spyOn(client, 'execute').mockResolvedValue({
        transient: { [exclusion]: '' }, persistent: { [exclusion]: '10.0.0.9' },
    });
    expect(await client.getClusterSettings()).toEqual({ ...baseline, allocationExcludeIp: '' });
    expect(execute).toHaveBeenCalledWith('/_cluster/settings?flat_settings=true');
});

it.each([
    { error: 'unavailable' },
    { transient: {}, persistent: [] },
    { transient: { [rebalance]: false }, persistent: {} },
])('rejects malformed settings instead of inferring a reset: %j', async (response) => {
    jest.spyOn(client, 'execute').mockResolvedValue(response);
    await expect(client.getClusterSettings()).rejects.toThrow(/settings/i);
});

it.each([
    [null, '10.0.0.9,10.0.0.1'],
    ['10.0.0.8', '10.0.0.8,10.0.0.1'],
    ['10.0.0.1,10.0.0.8', '10.0.0.1,10.0.0.8'],
    ['', '10.0.0.1'],
])('applies effective baseline exclusions %j plus the target, enabling rebalancing', async (savedIp, expectedIp) => {
    const saved = { ...baseline, allocationExcludeIp: savedIp };
    jest.spyOn(client, 'getClusterSettings')
        .mockResolvedValueOnce({ ...saved, rebalanceEnable: 'none' })
        .mockResolvedValueOnce({ ...saved, rebalanceEnable: 'all', allocationExcludeIp: expectedIp });
    const execute = jest.spyOn(client, 'execute').mockResolvedValue({ acknowledged: true });
    await client.applyMigrationSettings(saved, targetIp);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('/_cluster/settings', {
        transient: { [rebalance]: 'all', [exclusion]: expectedIp },
    });
});

it.each([
    baseline,
    { ...baseline, rebalanceEnable: 'primaries', allocationExcludeIp: '10.0.0.8' },
])('restores exact original transient strings or null resets via a survivor', async (saved) => {
    const ownedIp = `${saved.allocationExcludeIp ?? saved.persistentAllocationExcludeIp},${targetIp}`;
    jest.spyOn(client, 'getClusterSettings')
        .mockResolvedValueOnce({ ...saved, rebalanceEnable: 'all', allocationExcludeIp: ownedIp })
        .mockResolvedValueOnce(saved);
    const execute = jest.spyOn(client, 'execute').mockResolvedValue({ acknowledged: true });
    await client.restoreClusterSettings(saved, targetIp);
    expect(execute).toHaveBeenCalledWith('/_cluster/settings', {
        transient: { [rebalance]: saved.rebalanceEnable, [exclusion]: saved.allocationExcludeIp },
    });
});

it.each(['applyMigrationSettings', 'restoreClusterSettings'] as const)('%s is idempotent and fails closed on unrelated changes', async (method) => {
    const settings = jest.spyOn(client, 'getClusterSettings');
    const execute = jest.spyOn(client, 'execute');
    settings.mockResolvedValue(method === 'applyMigrationSettings' ? migrating : baseline);
    await client[method](baseline, targetIp);
    expect(execute).not.toHaveBeenCalled();
    for (const change of [
        { rebalanceEnable: 'replicas' },
        { allocationExcludeIp: '10.0.0.77' },
        { persistentAllocationExcludeIp: '10.0.0.77' },
    ]) {
        settings.mockResolvedValue({ ...migrating, ...change });
        await expect(client[method](baseline, targetIp)).rejects.toThrow(/conflict/i);
    }
    expect(execute).not.toHaveBeenCalled();
});

it.each(['applyMigrationSettings', 'restoreClusterSettings'] as const)('%s verifies readback and does not retry uncertain writes', async (method) => {
    const current = method === 'applyMigrationSettings' ? baseline : migrating;
    const settings = jest.spyOn(client, 'getClusterSettings').mockResolvedValue(current);
    const execute = jest.spyOn(client, 'execute').mockResolvedValue({ acknowledged: true });
    await expect(client[method](baseline, targetIp)).rejects.toThrow(/readback/i);
    expect(execute).toHaveBeenCalledTimes(1);
    execute.mockClear().mockRejectedValue(new Error('SSM timed out'));
    settings.mockResolvedValue(current);
    await expect(client[method](baseline, targetIp)).rejects.toThrow('SSM timed out');
    expect(execute).toHaveBeenCalledTimes(1);
});

it.each(['disableRebalancing', 'applyMigrationSettings', 'restoreClusterSettings'] as const)(
    '%s reconciles an applied write after its response is lost', async method => {
        let current = method === 'restoreClusterSettings' ? { ...migrating } : { ...baseline };
        jest.spyOn(client, 'getClusterSettings').mockImplementation(async () => ({ ...current }));
        const execute = jest.spyOn(client, 'execute').mockImplementation(async (_path, body: any) => {
            current = {
                ...current,
                rebalanceEnable: body.transient[rebalance],
                allocationExcludeIp: body.transient[exclusion],
            };
            throw new Error('applied, response lost');
        });
        await expect(client[method](baseline, targetIp)).rejects.toThrow('response lost');
        await client[method](baseline, targetIp);
        expect(execute).toHaveBeenCalledTimes(1);
    }
);

it('requires the rotation-owned exclusion before removal', async () => {
    const settings = jest.spyOn(client, 'getClusterSettings').mockResolvedValue(migrating);
    await client.assertMigrationSettings(baseline, targetIp);
    settings.mockResolvedValue(baseline);
    await expect(client.assertMigrationSettings(baseline, targetIp)).rejects.toThrow('exclusion changed');
});

it('counts shard copies by node ID, including relocation targets and zero-document shards', async () => {
    const node = new ElasticsearchNode(new Instance('i-target', new Date(), targetIp, 'source'), 'node-id', false);
    const execute = jest.spyOn(client, 'execute').mockResolvedValue({
        routing_table: { indices: { index: { shards: { '0': [
            { node: 'node-id', relocating_node: null },
            { node: 'other-id', relocating_node: 'node-id' },
            { node: 'other-id', relocating_node: null },
            { node: null, relocating_node: null },
        ] } } } },
    });
    expect(await client.getAllocatedShardCount(node)).toBe(2);
    expect(execute).toHaveBeenCalledWith('/_cluster/state/routing_table');
    execute.mockResolvedValue({ routing_table: { indices: {} } });
    expect(await client.getAllocatedShardCount(node)).toBe(0);
    execute.mockResolvedValue({ error: 'unavailable' });
    await expect(client.getAllocatedShardCount(node)).rejects.toThrow(/routing table/i);
    execute.mockResolvedValue({ routing_table: { indices: { index: { shards: { '0': [{}] } } } } });
    await expect(client.getAllocatedShardCount(node)).rejects.toThrow(/shard allocation/i);
});
