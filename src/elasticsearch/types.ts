import {Instance} from '../aws/types';
import {stringList} from "aws-sdk/clients/datapipeline";

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

export interface NodeStats {
    nodes: NodeInfoObject
}

interface NodeInfoObject {
    [key: string]: NodeInfo
}

interface NodeInfo {
    indices: IndicesInfo
}

interface IndicesInfo {
    docs: Documents
}

export interface Documents {
    count: number
}

export interface ShardCopy {
    node: string;
    shard: number;
    index: string;
}

export class Shard {
    shardName: string;
    shardCopies: ShardCopy[];

    constructor(shardName, shardCopies) {
        this.shardName = shardName;
        this.shardCopies = shardCopies;
    }
}

export class IndexShards {
    indexName: string;
    shards: Shard[];

    constructor(indexName, shards) {
        this.indexName = indexName;
        this.shards = shards;
    }
}

export class RoutingTable {
    indexShards: IndexShards[];

    //Construct from the json returned by Elasticsearch
    constructor(json) {
        const indices = json.routing_table.indices;
        const indexNames: string[] = Object.keys(indices);

        this.indexShards = indexNames.map(indexName => {
            const shardNames: string[] = Object.keys(indices[indexName].shards);
            const shards = shardNames.map(shardName => {
                return new Shard(shardName, indices[indexName].shards[shardName])
            });
            return new IndexShards(indexName, shards);
        });
    }
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
