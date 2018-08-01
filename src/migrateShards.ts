import {ssmCommand} from './utils/ssmCommand'

export async function handler(instanceId: string): Promise<DefaultResponse> {
    return getShardInfo(instanceId)
        .then(response => moveInstructions(response, "qR4vaE3zRvyjXBHvONxh_w", "1O3sqqH4R8ScTrtV9tX6fg"))
        .then(moves => migrateShards(moves, instanceId));
}

function getShardInfo(instanceId: string): Promise<object> {
    return ssmCommand(`curl localhost:9200/_cluster/state/routing_table`, instanceId)
        .then(JSON.parse);
}

function migrateShards(moves: Move[], instanceId: string): Promise<DefaultResponse> {
    const commands: MoveCommand[] = moves.map(buildMoveCommand);
    const rerouteCommand: RerouteCommand = {
        commands
    };
    console.log(`Re-route command will be: ${JSON.stringify(rerouteCommand)}`);
    const elasticsearchCommand = `curl -f -v -X POST "localhost:9200/_cluster/reroute" -H 'Content-Type: application/json' -d '${JSON.stringify(rerouteCommand)}'`;
    return ssmCommand(elasticsearchCommand, instanceId)
        .then(() => {
                const response: DefaultResponse = {"instanceId": instanceId};
                return response;
            }
        )
}

export function moveInstructions(response, oldNode: string, newNode: string): Move[] {
    const indices = response.routing_table.indices;
    const indexNames: string[] = Object.keys(indices);
    const shards = indexNames.map(index => indices[index].shards);
    const shardNumbers = Object.keys(shards);
    const shardArrays = shardNumbers.map(shardNumber => shards[shardNumber][0]);
    const allShardCopies: ShardCopy[] = shardArrays.concat.apply([], shardArrays);
    const shardCopiesToMove: ShardCopy[] = findShardCopiesOnNode(allShardCopies, oldNode);
    const moveCommands: Move[] = shardCopiesToMove.map(copy => new Move(copy.index, copy.shard, oldNode, newNode));
    console.log(`Constructed the following move commands: ${JSON.stringify(moveCommands)}`);
    return moveCommands;
}

function findShardCopiesOnNode(shardCopies: ShardCopy[], node: string): ShardCopy[] {
    return shardCopies.filter(copy => copy.node === node);
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


