import {TargetAndNewNodeResponse} from './utils/handlerInputs';
import {ssmCommand} from './utils/ssmCommand';
import {getASG, terminateInstanceInASG} from "./aws/autoscaling";
import {Instance} from './aws/types';
import {Elasticsearch} from './elasticsearch/elasticsearch';

export async function handler(event: TargetAndNewNodeResponse): Promise<TargetAndNewNodeResponse> {

    const targetInstance: Instance = event.targetElasticSearchNode.ec2Instance;
    if (event.targetElasticSearchNode.isMasterEligible) try {
        console.log(`attempting to smoothly shutdown master-eligible node: ${targetInstance.id}`);
        await ssmCommand("systemctl stop elasticsearch", targetInstance.id, false);
    } catch(error) {
        console.log(`Will still attempt to terminate ${targetInstance.id} after best effort at gentle shutdown not completed due to: ${error}`);
    }

    const allocationClearCandidates = await getAllocationClearCandidates(event);

    await Promise.all([
        terminateInstanceInASG(targetInstance),
        clearAllocationExclusion(allocationClearCandidates)
    ]);

    return event;
}

async function getAllocationClearCandidates(event: TargetAndNewNodeResponse): Promise<string[]> {
    const candidateIds = new Set<string>();
    candidateIds.add(event.newestElasticsearchNode.ec2Instance.id);
    candidateIds.add(event.targetElasticSearchNode.ec2Instance.id);

    try {
        const asg = await getASG(event.destinationAsgName);
        const inServiceIds = asg.Instances
            ?.filter(instance => instance.InstanceId && instance.LifecycleState === 'InService')
            .map(instance => instance.InstanceId as string);
        inServiceIds?.forEach(id => candidateIds.add(id));
    } catch (error) {
        console.log(`Failed to list ASG instances for allocation cleanup: ${error}`);
    }

    return Array.from(candidateIds);
}

async function clearAllocationExclusion(instanceIds: string[]): Promise<void> {
    if (instanceIds.length === 0) {
        console.log('No instances available to clear allocation exclusion; skipping');
        return;
    }

    for (const instanceId of instanceIds) {
        try {
            const elasticsearchClient = new Elasticsearch(instanceId);
            await elasticsearchClient.excludeFromAllocation(""); // Don't exclude any ips
            console.log(`Cleared allocation exclusion via ${instanceId}`);
            return;
        } catch (error) {
            console.log(`Failed to clear allocation exclusion via ${instanceId}: ${error}`);
        }
    }

    throw new Error('Failed to clear allocation exclusion via any instance');
}
