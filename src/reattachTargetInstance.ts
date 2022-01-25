import {attachInstance} from './aws/autoscaling';
import {TargetAndNewNodeResponse} from './utils/handlerInputs';
import {Instance} from './aws/types';

export async function handler(event: TargetAndNewNodeResponse): Promise<TargetAndNewNodeResponse> {

    const targetInstance: Instance = event.targetElasticSearchNode.ec2Instance;
    const asg: string = event.asgName;

    return new Promise<TargetAndNewNodeResponse>((resolve, reject) => {
        attachInstance(targetInstance, asg)
            .then( () => {
                resolve(event);
            })
            .catch(error => {
                console.log(`Failed to reattach target instance: ${error}`);
                reject(error);
            })
    })

}
