import {ElasticsearchNode} from './utils/elasticsearch'

export interface DefaultResponse {
    oldestElasticsearchNode: ElasticsearchNode;
}

export interface ClusterStatusResponse extends DefaultResponse {
    clusterStatus: string;
}

export interface AddElasticsearchNodeResponse extends DefaultResponse {
    expectedClusterSize: number;
}

export interface ClusterSizeCheckResponse extends DefaultResponse {
    newestElasticsearchNode: ElasticsearchNode;
}