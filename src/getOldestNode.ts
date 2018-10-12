import {OldestNodeResponse} from './utils/handlerInputs';
import {getInstances, getSpecificInstance} from './aws/ec2Instances';
import {getElasticsearchNode} from './elasticsearch/elasticsearch';
import {Instance} from './aws/types';

export async function handler(event): Promise<OldestNodeResponse> {
    return new Promise<OldestNodeResponse>((resolve, reject) => {
        const asg: string = event.asgName;
        console.log(`Searching for oldest node in ${asg}`);
        getInstances(asg)
            .then(instances => getSpecificInstance(instances, findOldestInstance))
            .then(getElasticsearchNode)
            .then(node => {
                resolve({
                    asgName: asg,
                    "oldestElasticsearchNode": node
                })
            })
            .catch(error => {
                console.log(`Failed to identify the oldest node in the cluster due to: ${error}`);
                reject(error)
            })
    })

}

export function findOldestInstance(instances: Instance[]): Instance {
    const sortedInstances: Instance[] = instances.sort(function(a,b){return a.launchTime.getTime() - b.launchTime.getTime()});
    const oldestInstance: Instance = sortedInstances[0];
    console.log(`Oldest instance ${oldestInstance.id} was launched at ${oldestInstance.launchTime}`);
    return oldestInstance;
}






