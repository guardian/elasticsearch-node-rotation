import {ElasticsearchNode} from '../elasticsearch/types'

export interface OldestNodeResponse {
    oldestElasticsearchNode: ElasticsearchNode;
}

export interface OldAndNewNodeResponse extends OldestNodeResponse {
    newestElasticsearchNode: ElasticsearchNode;
}

export interface ClusterStatusResponse extends OldestNodeResponse {
    clusterStatus: string;
}

export interface AddNodeResponse extends OldestNodeResponse {
    expectedClusterSize: number;
}