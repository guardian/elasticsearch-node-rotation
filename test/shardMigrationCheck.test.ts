import { handler } from '../src/shardMigrationCheck';
import { Elasticsearch } from '../src/elasticsearch/elasticsearch';
import { TargetAndNewNodeResponse } from '../src/utils/handlerInputs';

jest.mock('../src/elasticsearch/elasticsearch');

it.each([
    ['green', 0, 0, true],
    ['green', 0, 1, false],
    ['green', 1, 0, false],
    ['yellow', 0, 0, false],
])('checks status=%s, relocating=%s, allocated=%s', async (status, relocating, allocated, safe) => {
    (Elasticsearch as jest.Mock).mockImplementation(() => ({
        getClusterHealth: async () => ({
            status,
            relocating_shards: relocating,
        }),
        getAllocatedShardCount: async () => allocated,
    }));
    const event = {
        targetElasticSearchNode: {
            ec2Instance: { id: 'i-target' },
        },
    } as TargetAndNewNodeResponse;
    if (safe) {
        await expect(handler(event)).resolves.toBe(event);
    } else {
        await expect(handler(event)).rejects.toThrow('Shard migration incomplete');
    }
});
