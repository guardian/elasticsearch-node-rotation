import {OldAndNewNodeResponse} from './utils/handlerInputs';
import {ssmCommand} from './utils/ssmCommand';
import {terminateInstanceInASG} from "./aws/autoscaling";
import {Instance} from './aws/types';
import {excludeFromAllocation} from "./elasticsearch/elasticsearch";

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {

    const oldestInstance: Instance = event.oldestElasticsearchNode.ec2Instance;
    const newestInstance: Instance = event.newestElasticsearchNode.ec2Instance;

    if (event.oldestElasticsearchNode.isMasterEligible) try {
        await ssmCommand("systemctl stop elasticsearch", oldestInstance.id, false);
    } catch(error) {
        console.log(`Will still attempt to terminate ${oldestInstance.id} after best effort at gentle shutdown not completed due to: ${error}`);
    }

    await Promise.all([
        terminateInstanceInASG(oldestInstance),
        excludeFromAllocation("", newestInstance.id) // Don't exclude any ips
    ]);

    return event;
}
