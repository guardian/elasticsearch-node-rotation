import {OldAndNewNodeResponse} from './utils/handlerResponses';
import {getShardInfo, migrateShards} from './elasticsearch/elasticsearch';
import {ElasticsearchNode, Move, ShardCopy} from './elasticsearch/types'

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {
    const oldestElasticsearchNode: ElasticsearchNode = event.oldestElasticsearchNode;
    const newestElasticsearchNode: ElasticsearchNode = event.newestElasticsearchNode;
    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        getShardInfo(oldestElasticsearchNode.ec2Instance.id)
            .then(response => moveInstructions(response, oldestElasticsearchNode, newestElasticsearchNode))
            .then(moves => migrateShards(moves, oldestElasticsearchNode))
            .then(() => resolve(event))
            .catch(error => {
                console.log(`Failed to perform shard migration due to: ${error}`);
                reject(error);
            });
    })
}

function moveInstructions(response, oldNode: ElasticsearchNode, newNode: ElasticsearchNode): Move[] {
    const indices = response.routing_table.indices;
    const indexNames: string[] = Object.keys(indices);
    const shards = indexNames.map(index => indices[index].shards);
    const shardNumbers = Object.keys(shards);
    const shardArrays = shardNumbers.map(shardNumber => shards[shardNumber][0]);
    const allShardCopies: ShardCopy[] = shardArrays.concat.apply([], shardArrays);
    const shardCopiesToMove: ShardCopy[] = findShardCopiesOnNode(allShardCopies, oldNode);
    const moveCommands: Move[] = shardCopiesToMove.map(copy => new Move(copy.index, copy.shard, oldNode.nodeId, newNode.nodeId));
    console.log(`Constructed the following move commands: ${JSON.stringify(moveCommands)}`);
    return moveCommands;
}

function findShardCopiesOnNode(shardCopies: ShardCopy[], elasticsearchNode: ElasticsearchNode): ShardCopy[] {
    return shardCopies.filter(copy => copy.node === elasticsearchNode.nodeId);
}

export const _ = { moveInstructions };

