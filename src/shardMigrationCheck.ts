import { TargetAndNewNodeResponse } from './utils/handlerInputs';
import { Elasticsearch } from './elasticsearch/elasticsearch';

export async function handler(event: TargetAndNewNodeResponse): Promise<TargetAndNewNodeResponse> {
    const client = new Elasticsearch(event.targetElasticSearchNode.ec2Instance.id);
    const [health, shards] = await Promise.all([
        client.getClusterHealth(),
        client.getAllocatedShardCount(event.targetElasticSearchNode),
    ]);
    if (health.status !== 'green' || health.relocating_shards !== 0 || shards !== 0) {
        throw new Error(`Shard migration incomplete: status=${health.status}, relocating=${health.relocating_shards}, targetShards=${shards}`);
    }
    return event;
}
