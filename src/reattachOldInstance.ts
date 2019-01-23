import {attachInstance} from './aws/autoscaling';
import {OldAndNewNodeResponse} from './utils/handlerInputs';
import {Instance} from './aws/types';

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {

    const oldestInstance: Instance = event.oldestElasticsearchNode.ec2Instance;
    const asg: string = event.asgName;

    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        attachInstance(oldestInstance, asg)
            .then( () => {
                resolve(event);
            })
            .catch(error => {
                console.log(`Failed to reattach old instance: ${error}`);
                reject(error);
            })
    })

}
