import { TargetAndNewNodeResponse, requireClusterSettingsPlan } from './utils/handlerInputs';
import { ssmCommand } from './utils/ssmCommand';
import { getRemovalState, reconcileStandby, reconcileTermination } from './aws/autoscaling';
import { survivingClient } from './elasticsearch/survivingClient';
import { assertSafeToRemove } from './elasticsearch/removalSafety';

export async function handler(event: TargetAndNewNodeResponse): Promise<TargetAndNewNodeResponse> {
    const plan = requireClusterSettingsPlan(event);
    const target = event.targetElasticSearchNode.ec2Instance;
    const replacementId = event.newestElasticsearchNode.ec2Instance.id;
    let state = await getRemovalState(target, plan, replacementId);

    if (state === 'InService' || state === 'EnteringStandby' || state === 'Standby') {
        const client = await survivingClient(event);
        if (state === 'InService') {
            await assertSafeToRemove(client, event, false);
        }
        if (state === 'InService' || state === 'EnteringStandby') {
            state = await reconcileStandby(target, plan, replacementId);
        }
        if (state === 'Standby') {
            // A failed invocation may already have stopped Elasticsearch on this node.
            await assertSafeToRemove(client, event, true);
            if (event.targetElasticSearchNode.isMasterEligible) {
                try {
                    await ssmCommand('systemctl stop elasticsearch', target.id, false);
                } catch (error) {
                    console.log(`Best-effort shutdown of ${target.id} failed: ${error}`);
                }
            }
        }
    }
    if (state !== 'Terminated') {
        await reconcileTermination(target, plan, replacementId);
    }
    return event;
}
