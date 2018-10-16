import {ElasticsearchNode} from '../elasticsearch/types'

export interface StateMachineInput extends AsgInput {
    stepFunctionArn: string;
}

export interface AsgInput {
    asgName: string;
}

export interface OldestNodeResponse extends AsgInput {
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
