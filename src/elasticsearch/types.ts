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
