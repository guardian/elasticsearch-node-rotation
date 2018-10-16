import { OldestNodeResponse, StateMachineInput } from './utils/handlerInputs';
import {getInstances, getSpecificInstance} from './aws/ec2Instances';
import {getElasticsearchNode} from './elasticsearch/elasticsearch';
import {Instance} from './aws/types';
import { totalRunningExecutions } from './aws/stepFunctions';

export async function handler(event: StateMachineInput): Promise<OldestNodeResponse> {
    return new Promise<OldestNodeResponse>((resolve, reject) => {
        const asg: string = event.asgName;
        const arn: string = event.stepFunctionArn;
        Promise.all([
            totalRunningExecutions(arn),
            getInstances(asg)
        ])
            .then(([runningExecutions, instances]: [number, string[]]) => {
                if (runningExecutions !== 1) {
                    const error = `Failing Step Function execution; expected to find one running execution (this one!) but there were ${runningExecutions}.`;
                    console.log(error);
                    reject(error)
                }
                console.log(`Searching for oldest node in ${asg}`);
                return getSpecificInstance(instances, findOldestInstance);
            })
            .then(getElasticsearchNode)
            .then(node => {
                resolve({
                    asgName: asg,
                    oldestElasticsearchNode: node
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






