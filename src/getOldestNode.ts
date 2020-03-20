import {AutoScalingGroupCheckResponse, OldestNodeResponse} from './utils/handlerInputs';
import {getSpecificInstance} from './aws/ec2Instances';
import {getElasticsearchNode} from './elasticsearch/elasticsearch';
import {Instance} from './aws/types';

export async function handler(event: AutoScalingGroupCheckResponse): Promise<OldestNodeResponse> {
    try {
        const asg = event.asgName
        const instances: string[] = event.instanceIds
        console.log(`Searching for oldest node in ${asg}`)
        const specificInstance = await getSpecificInstance(instances, findOldestInstance)
        const node = await getElasticsearchNode(specificInstance)

        return ({
            asgName: event.asgName,
            oldestElasticsearchNode: node
        })
    } catch (error) { 
        console.log(`Failed to identify the oldest node in the cluster due to: ${error}`)
        throw error
    }


}

export function findOldestInstance(instances: Instance[]): Instance {
    const sortedInstances: Instance[] = instances.sort(function(a,b){return a.launchTime.getTime() - b.launchTime.getTime()});
    const oldestInstance: Instance = sortedInstances[0];
    console.log(`Oldest instance ${oldestInstance.id} was launched at ${oldestInstance.launchTime}`);
    return oldestInstance;
}






