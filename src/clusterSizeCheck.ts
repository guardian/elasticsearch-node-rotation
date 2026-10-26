import { getASG } from './aws/autoscaling';
import { getSpecificInstance } from './aws/ec2Instances';
import { Elasticsearch } from './elasticsearch/elasticsearch';
import {
    AddNodeResponse,
    TargetAndNewNodeResponse,
    requireRotationPlan,
} from './utils/handlerInputs';

export async function handler(event: AddNodeResponse): Promise<TargetAndNewNodeResponse> {
    const plan = requireRotationPlan(event);
    const asg = await getASG(event.destinationAsgName);
    if (
        asg.AutoScalingGroupName !== plan.destinationAsg.name ||
        asg.AutoScalingGroupARN !== plan.destinationAsg.arn
    ) {
        throw new Error(`ASG identity/ARN drift for ${event.destinationAsgName}`);
    }

    const sameAsg = plan.sourceAsg.name === plan.destinationAsg.name;
    const expectedCapacity = plan.destinationAsg.desiredCapacity + (sameAsg ? 0 : 1);
    if (asg.DesiredCapacity !== expectedCapacity) {
        throw new Error(
            `Unexpected desired capacity ${asg.DesiredCapacity} for ${event.destinationAsgName}`
        );
    }

    const instances = asg.Instances ?? [];
    const targetId = event.targetElasticSearchNode.ec2Instance.id;
    if (sameAsg && instances.some((instance) => instance.InstanceId === targetId)) {
        throw new Error(
            `Target ${targetId} is still an ASG member; waiting for detachment to finish`
        );
    }

    const missingBaseline = plan.destinationAsg.instanceIds.filter(
        (id) =>
            !(sameAsg && id === targetId) &&
            !instances.some((instance) => instance.InstanceId === id)
    );
    if (missingBaseline.length > 0) {
        throw new Error(
            `Unexpected membership drift in ${event.destinationAsgName}: ` +
                missingBaseline.join(', ')
        );
    }

    const candidates = instances.filter(
        (instance) => !plan.destinationAsg.instanceIds.includes(instance.InstanceId)
    );
    if (candidates.length !== 1) {
        throw new Error(
            `Expected one replacement in ${event.destinationAsgName}, ` +
                `found ${candidates.length}; refusing to guess`
        );
    }

    const replacementId = candidates[0].InstanceId;
    if (
        !replacementId ||
        replacementId === targetId ||
        candidates[0].LifecycleState !== 'InService' ||
        candidates[0].HealthStatus !== 'Healthy'
    ) {
        throw new Error(`Replacement ${replacementId} is not yet healthy and InService`);
    }

    const replacement = await getSpecificInstance([replacementId], (matches) => {
        if (
            matches.length !== 1 ||
            matches[0].id !== replacementId ||
            matches[0].autoScalingGroupName !== event.destinationAsgName
        ) {
            throw new Error(`Unexpected EC2 identity for replacement ${replacementId}`);
        }
        return matches[0];
    });
    const elasticsearchClient = new Elasticsearch(targetId);
    const health = await elasticsearchClient.getClusterHealth();
    if (health.number_of_nodes !== plan.expectedClusterSize) {
        throw new Error(
            `Found ${health.number_of_nodes} nodes but expected to find ${plan.expectedClusterSize}`
        );
    }

    const newestElasticsearchNode = await elasticsearchClient.getElasticsearchNode(replacement);
    return { ...event, newestElasticsearchNode };
}
