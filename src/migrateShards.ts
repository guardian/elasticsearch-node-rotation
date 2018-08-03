import {ssmCommand} from './utils/ssmCommand'
import {ClusterSizeCheckResponse, DefaultResponse} from './handlerResponses';
import {ElasticsearchNode} from './utils/elasticsearch';

export async function handler(event: ClusterSizeCheckResponse): Promise<DefaultResponse> {
    const oldestElasticsearchNode: ElasticsearchNode = event.oldestElasticsearchNode;
    const newestElasticsearchNode: ElasticsearchNode = event.newestElasticsearchNode;
    return getShardInfo(oldestElasticsearchNode.ec2Instance.id)
        .then(response => moveInstructions(response, oldestElasticsearchNode, newestElasticsearchNode))
        .then(moves => migrateShards(moves, oldestElasticsearchNode));
}

function getShardInfo(instanceId: string): Promise<object> {
    return ssmCommand(`curl localhost:9200/_cluster/state/routing_table`, instanceId)
        .then(JSON.parse);
}

function migrateShards(moves: Move[], oldestElasticsearchNode: ElasticsearchNode): Promise<DefaultResponse> {
    const commands: MoveCommand[] = moves.map(buildMoveCommand);
    const rerouteCommand: RerouteCommand = {
        commands
    };
    console.log(`Re-route command will be: ${JSON.stringify(rerouteCommand)}`);
    const elasticsearchCommand = `curl -f -v -X POST "localhost:9200/_cluster/reroute" -H 'Content-Type: application/json' -d '${JSON.stringify(rerouteCommand)}'`;
    return ssmCommand(elasticsearchCommand, oldestElasticsearchNode.ec2Instance.id)
        .then(() => {
                const response: DefaultResponse = {"oldestElasticsearchNode": oldestElasticsearchNode};
                return response;
            }
        )
}

export function moveInstructions(response, oldNode: ElasticsearchNode, newNode: ElasticsearchNode): Move[] {
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

interface ShardCopy {
    node: string;
    shard: number;
    index: string;
}

interface RerouteCommand {
    commands: MoveCommand[]
}

interface MoveCommand {
    move: Move
}

export class Move {

    index: string;
    shard: number;
    from_node: string;
    to_node: string;

    constructor(indexName, shardNumber, oldNode, newNode) {
        this.index = indexName;
        this.shard = shardNumber;
        this.from_node = oldNode;
        this.to_node = newNode;
    }
}

function buildMoveCommand(move: Move): MoveCommand {
    return { "move": move };
}


