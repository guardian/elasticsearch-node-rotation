import { TargetAndNewNodeResponse, requireClusterSettingsPlan } from './utils/handlerInputs';
import { survivingClient } from './elasticsearch/survivingClient';

export async function handler(event: TargetAndNewNodeResponse): Promise<TargetAndNewNodeResponse> {
    const plan = requireClusterSettingsPlan(event);
    // Only reached after RemoveNode confirms termination. Keeping this a separate
    // Task lets cleanup redrive even after EC2 forgets the terminated instance.
    const client = await survivingClient(event);
    await client.restoreClusterSettings(
        plan.clusterSettings,
        event.targetElasticSearchNode.ec2Instance.privateIp
    );
    return event;
}
