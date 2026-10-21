import type { ElasticsearchNode } from '../elasticsearch/types';

export interface StateMachineInput {
    autoScalingGroupDiscoveryTagKey: string;
    ageThresholdInDays: number;
    stepFunctionArn: string;
    targetInstanceId?: string;
    skipFailureCheck: boolean;
}

export type PreviousRunCheckInput = StateMachineInput;

export interface PreviousRunCheckResponse extends StateMachineInput {
    skipRotation: boolean;
}

export interface AsgInput {
    // The ASG a node will be rotated _into_. In certain circumstances this may
    // not be the same as the ASG the node was rotated _out of_, which is stored at
    // targetElasticSearchNode.ec2Instance.autoScalingGroupName.
    destinationAsgName: string;
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
