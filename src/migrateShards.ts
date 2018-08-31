import {OldAndNewNodeResponse} from './utils/handlerResponses';
import {getRoutingTable, migrateShards} from './elasticsearch/elasticsearch';
import {ElasticsearchNode, IndexShards, Move, RoutingTable, Shard, ShardCopy} from './elasticsearch/types'

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {
    const oldestElasticsearchNode: ElasticsearchNode = event.oldestElasticsearchNode;
    const newestElasticsearchNode: ElasticsearchNode = event.newestElasticsearchNode;
    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        getRoutingTable(oldestElasticsearchNode.ec2Instance.id)
            .then(response => moveInstructions(response, oldestElasticsearchNode, newestElasticsearchNode))
            .then(moves => migrateShards(moves, oldestElasticsearchNode))
            .then(() => resolve(event))
            .catch(error => {
                console.log(`Failed to perform shard migration due to: ${error}`);
                reject(error);
            });
    })
}

const flatMap = (f,xs) => xs.map(f).reduce((x,y) => x.concat(y), []);

function moveInstructions(routingTable: RoutingTable, oldNode: ElasticsearchNode, newNode: ElasticsearchNode): Move[] {
    const allShardCopies: ShardCopy[] = flatMap((indexShards: IndexShards) =>
        flatMap((shard: Shard) => shard.shardCopies, indexShards.shards),
        routingTable.indexShards
    );

    const shardCopiesToMove: ShardCopy[] = findShardCopiesOnNode(allShardCopies, oldNode);

    const moveCommands: Move[] = shardCopiesToMove.map(copy => new Move(copy.index, copy.shard, oldNode.nodeId, newNode.nodeId));
    console.log(`Constructed the following move commands: ${JSON.stringify(moveCommands)}`);
    return moveCommands;
}

function findShardCopiesOnNode(shardCopies: ShardCopy[], elasticsearchNode: ElasticsearchNode): ShardCopy[] {
    return shardCopies.filter(copy => copy.node === elasticsearchNode.nodeId);
}

export const _ = { moveInstructions };

