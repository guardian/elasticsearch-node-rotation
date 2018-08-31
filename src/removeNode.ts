import {OldAndNewNodeResponse} from './utils/handlerResponses';
import {ssmCommand} from './utils/ssmCommand';
import {terminateInstance} from "./aws/ec2Instances";
import {Instance} from './aws/types';

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {

    const oldestInstance: Instance = event.oldestElasticsearchNode.ec2Instance;

    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        ssmCommand("systemctl stop elasticsearch", oldestInstance.id, false)
                .then(() => terminateInstance(oldestInstance))
                // TODO clear ES allocation exclusion list here
                .then(() => resolve(event))
                .catch(error => {
                    const message = `Failed due to terminate ${oldestInstance.id} due to: ${error}`;
                    console.log(message);
                    reject(message)
                })
    })

}