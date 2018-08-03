import {DefaultResponse} from './handlerResponses';
import {getInstances, getSpecificInstance, Instance} from "./utils/ec2Instances";
import {getElasticsearchNode} from './utils/elasticsearch';

export async function handler(event): Promise<DefaultResponse> {
    return new Promise<DefaultResponse>((resolve, reject) => {
        const asg: string = process.env.ASG_NAME;
        console.log(`Searching for oldest node in ${asg}`);
        getInstances(asg)
            .then(instances => getSpecificInstance(instances, findOldestInstance))
            .then(getElasticsearchNode)
            .then(node => {
                resolve({
                    "oldestElasticsearchNode": node
                })
            })
            .catch(error => reject(error))
    })

}

export function findOldestInstance(instances: Instance[]): Instance {
    const sortedInstances: Instance[] = instances.sort(function(a,b){return a.launchTime.getTime() - b.launchTime.getTime()});
    const oldestInstance: Instance = sortedInstances[0];
    console.log(`Oldest instance ${oldestInstance.id} was launched at ${oldestInstance.launchTime}`);
    return oldestInstance;
}






