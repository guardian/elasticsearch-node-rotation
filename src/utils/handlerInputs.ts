import {ElasticsearchNode} from '../elasticsearch/types'

export interface StateMachineInput {
    autoScalingGroupDiscoveryTagKey: string;
    stepFunctionArn: string;
}

export interface DiscoveredAsgsInput {
    asgNames: AsgInput[]
}

export interface AsgInput {
    asgName: string;
}

export interface AutoScalingGroupCheckResponse extends AsgInput {
    instanceIds: string[];
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
