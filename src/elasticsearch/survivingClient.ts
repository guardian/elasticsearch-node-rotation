import { getASG } from '../aws/autoscaling';
import { TargetAndNewNodeResponse } from '../utils/handlerInputs';
import { Elasticsearch } from './elasticsearch';

export async function survivingClient(event: TargetAndNewNodeResponse): Promise<Elasticsearch> {
    const targetId = event.targetElasticSearchNode.ec2Instance.id;
    const candidates = new Set([event.newestElasticsearchNode.ec2Instance.id]);
    try {
        const asg = await getASG(event.destinationAsgName);
        for (const instance of asg.Instances ?? []) {
            if (instance.InstanceId && instance.LifecycleState === 'InService') {
                candidates.add(instance.InstanceId);
            }
        }
    } catch (error) {
        console.log(`Failed to list surviving instances: ${error}`);
    }
    candidates.delete(targetId);
    for (const id of candidates) {
        const client = new Elasticsearch(id);
        try {
            await client.getClusterSettings();
            return client;
        } catch (error) {
            console.log(`Cannot reach Elasticsearch through ${id}: ${error}`);
        }
    }
    throw new Error('No surviving Elasticsearch node is reachable; fix connectivity and redrive');
}
