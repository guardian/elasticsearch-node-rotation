import {ElasticsearchNode} from '../elasticsearch/types'

export interface StateMachineInput {
    autoScalingGroupDiscoveryTagKey: string;
    ageThresholdInDays: number;
    stepFunctionArn: string;
    targetInstanceId?: string
}

export interface AsgInput {
    asgName: string;
    targetElasticSearchNode: ElasticsearchNode;
}

export type AsgDiscoveryResponse =
    { skipRotation: true } |
    { skipRotation: false } & AsgInput;


export interface TargetAndNewNodeResponse extends AsgInput {
    newestElasticsearchNode: ElasticsearchNode;
}

export interface ClusterStatusResponse extends AsgInput {
    clusterStatus: string;
}

export interface AddNodeResponse extends AsgInput {
    expectedClusterSize: number;
}
