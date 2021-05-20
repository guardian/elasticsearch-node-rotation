import {ElasticsearchNode} from '../elasticsearch/types'

export interface StateMachineInput {
    autoScalingGroupDiscoveryTagKey: string;
    stepFunctionArn: string;
    asgName?: string
}

export interface AsgInput {
    asgName: string;
}

export type AsgDiscoveryResponse =
    { alreadyRunning: true } |
    { alreadyRunning: false } & AsgInput;

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
