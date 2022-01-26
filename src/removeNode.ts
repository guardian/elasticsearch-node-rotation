import {TargetAndNewNodeResponse} from './utils/handlerInputs';
import {ssmCommand} from './utils/ssmCommand';
import {terminateInstanceInASG} from "./aws/autoscaling";
import {Instance} from './aws/types';
import {Elasticsearch} from './elasticsearch/elasticsearch';

export async function handler(event: TargetAndNewNodeResponse): Promise<TargetAndNewNodeResponse> {

    const targetInstance: Instance = event.targetElasticSearchNode.ec2Instance;
    const newestInstance: Instance = event.newestElasticsearchNode.ec2Instance;
    const elasticsearchClient = new Elasticsearch(newestInstance.id)

    if (event.targetElasticSearchNode.isMasterEligible) try {
        console.log(`attempting to smoothly shutdown master-eligible node: ${targetInstance.id}`);
        await ssmCommand("systemctl stop elasticsearch", targetInstance.id, false);
    } catch(error) {
        console.log(`Will still attempt to terminate ${targetInstance.id} after best effort at gentle shutdown not completed due to: ${error}`);
    }

    await Promise.all([
        terminateInstanceInASG(targetInstance),
        elasticsearchClient.excludeFromAllocation("") // Don't exclude any ips
    ]);

    return event;
}
