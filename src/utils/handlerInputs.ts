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
    rotationPlan?: RotationPlan;
}

export type AsgDiscoveryResponse = { skipRotation: true } | ({ skipRotation: false } & AsgInput);

export interface TargetAndNewNodeResponse extends AsgInput {
    newestElasticsearchNode: ElasticsearchNode;
}

export interface AsgSnapshot {
    name: string;
    arn: string;
    desiredCapacity: number;
    instanceIds: string[];
}

export interface RotationPlan {
    version: 1;
    sourceAsg: AsgSnapshot;
    destinationAsg: AsgSnapshot;
    expectedClusterSize: number;
}

export interface ClusterStatusResponse extends AsgInput {
    clusterStatus: string;
    rotationPlan: RotationPlan;
}

export interface AddNodeResponse extends AsgInput {
    rotationPlan: RotationPlan;
    expectedClusterSize: number;
}

export function validateRotationPlan(
    plan: RotationPlan,
    sourceAsgName: string,
    destinationAsgName: string,
    targetInstanceId: string
): void {
    const validSnapshot = (snapshot: AsgSnapshot): boolean =>
        !!snapshot &&
        typeof snapshot.name === 'string' &&
        snapshot.name.trim().length > 0 &&
        typeof snapshot.arn === 'string' &&
        snapshot.arn.trim().length > 0 &&
        Number.isSafeInteger(snapshot.desiredCapacity) &&
        snapshot.desiredCapacity >= 0 &&
        snapshot.desiredCapacity < Number.MAX_SAFE_INTEGER &&
        Array.isArray(snapshot.instanceIds) &&
        snapshot.instanceIds.every((id) => typeof id === 'string' && id.trim().length > 0) &&
        new Set(snapshot.instanceIds).size === snapshot.instanceIds.length &&
        snapshot.instanceIds.length === snapshot.desiredCapacity;

    if (
        !plan ||
        plan.version !== 1 ||
        !validSnapshot(plan.sourceAsg) ||
        !validSnapshot(plan.destinationAsg) ||
        !Number.isSafeInteger(plan.expectedClusterSize) ||
        plan.expectedClusterSize < 1 ||
        plan.sourceAsg.name !== sourceAsgName ||
        plan.destinationAsg.name !== destinationAsgName ||
        !plan.sourceAsg.instanceIds.includes(targetInstanceId)
    ) {
        throw new Error(
            'Missing or invalid rotation plan; start a new planned rotation ' +
                'or reconcile the existing rotation first'
        );
    }

    const source = plan.sourceAsg;
    const destination = plan.destinationAsg;
    const inconsistentSnapshots =
        source.name === destination.name
            ? source.arn !== destination.arn ||
              source.desiredCapacity !== destination.desiredCapacity ||
              source.instanceIds.some((id) => !destination.instanceIds.includes(id))
            : source.arn === destination.arn ||
              source.instanceIds.some((id) => destination.instanceIds.includes(id));

    if (inconsistentSnapshots) {
        throw new Error(
            'Inconsistent rotation plan; start a new planned rotation ' +
                'or reconcile the existing rotation first'
        );
    }
}

export function requireRotationPlan(event: AsgInput): RotationPlan {
    validateRotationPlan(
        event.rotationPlan,
        event.targetElasticSearchNode.ec2Instance.autoScalingGroupName,
        event.destinationAsgName,
        event.targetElasticSearchNode.ec2Instance.id
    );
    return event.rotationPlan;
}
