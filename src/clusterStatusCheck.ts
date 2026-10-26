import type { AutoScalingGroup } from '@aws-sdk/client-auto-scaling';
import { getASG } from './aws/autoscaling';
import { Elasticsearch } from './elasticsearch/elasticsearch';
import {
    AsgInput,
    AsgSnapshot,
    ClusterStatusResponse,
    requireRotationPlan,
    validateRotationPlan,
    validateClusterSettings,
} from './utils/handlerInputs';

function snapshot(asg: AutoScalingGroup, name: string): AsgSnapshot {
    const instances = asg.Instances ?? [];
    if (
        asg.AutoScalingGroupName !== name ||
        !asg.AutoScalingGroupARN ||
        !Number.isSafeInteger(asg.DesiredCapacity) ||
        asg.DesiredCapacity < 0 ||
        instances.length !== asg.DesiredCapacity ||
        instances.some(
            (instance) =>
                !instance.InstanceId ||
                instance.HealthStatus !== 'Healthy' ||
                instance.LifecycleState !== 'InService' ||
                (instance.WeightedCapacity !== undefined && instance.WeightedCapacity !== '1')
        ) ||
        (asg.DesiredCapacityType && asg.DesiredCapacityType !== 'units')
    ) {
        throw new Error(
            `Cannot plan rotation: ASG ${name} must have a stable, healthy, unweighted membership`
        );
    }

    return {
        name,
        arn: asg.AutoScalingGroupARN,
        desiredCapacity: asg.DesiredCapacity,
        instanceIds: instances.map((instance) => instance.InstanceId),
    };
}

export async function handler(event: AsgInput): Promise<ClusterStatusResponse> {
    const target = event.targetElasticSearchNode.ec2Instance;
    const elasticsearchClient = new Elasticsearch(target.id);

    // Never replace a saved baseline with observations from a partially completed rotation.
    if (event.rotationPlan) {
        const rotationPlan = requireRotationPlan(event);
        const health = await elasticsearchClient.getClusterHealth();
        return { ...event, clusterStatus: health.status, rotationPlan };
    }

    const [health, clusterSettings, source, destination] = await Promise.all([
        elasticsearchClient.getClusterHealth(),
        elasticsearchClient.getClusterSettings(),
        getASG(target.autoScalingGroupName),
        target.autoScalingGroupName === event.destinationAsgName
            ? Promise.resolve(undefined)
            : getASG(event.destinationAsgName),
    ]);
    if (!Number.isSafeInteger(health.number_of_nodes) || health.number_of_nodes < 1) {
        throw new Error('Cannot plan rotation: invalid cluster health response');
    }

    validateClusterSettings(clusterSettings);
    const sourceAsg = snapshot(source, target.autoScalingGroupName);
    const destinationAsg = destination
        ? snapshot(destination, event.destinationAsgName)
        : sourceAsg;
    const rotationPlan = {
        version: 1 as const,
        sourceAsg,
        destinationAsg,
        expectedClusterSize: health.number_of_nodes + 1,
        clusterSettings,
    };
    validateRotationPlan(
        rotationPlan,
        target.autoScalingGroupName,
        event.destinationAsgName,
        target.id
    );

    return { ...event, clusterStatus: health.status, rotationPlan };
}
