import {Instance} from '../aws/types';

export interface ElasticsearchClusterStatus {
    status: string;
    number_of_nodes: number;
    relocating_shards: number;
}

export class ElasticsearchNode {

    ec2Instance: Instance;
    nodeId: string;

    constructor(instance: Instance, nodeId: string) {
        this.ec2Instance = instance;
        this.nodeId = nodeId;
    }

}

export interface ShardCopy {
    node: string;
    shard: number;
    index: string;
}

export interface RerouteCommand {
    commands: MoveCommand[]
}

export interface MoveCommand {
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
