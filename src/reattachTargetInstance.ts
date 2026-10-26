import { attachInstance } from './aws/autoscaling';
import { TargetAndNewNodeResponse, requireRotationPlan } from './utils/handlerInputs';

export async function handler(event: TargetAndNewNodeResponse): Promise<TargetAndNewNodeResponse> {
    const rotationPlan = requireRotationPlan(event);
    const target = event.targetElasticSearchNode.ec2Instance;

    if (target.autoScalingGroupName !== event.destinationAsgName) {
        console.log(
            'New instance launched in different ASG than target instance, so nothing to reattach'
        );
        return event;
    }

    await attachInstance(
        target,
        event.destinationAsgName,
        rotationPlan,
        event.newestElasticsearchNode.ec2Instance.id
    );
    return event;
}
