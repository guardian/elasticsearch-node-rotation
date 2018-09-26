import {OldAndNewNodeResponse} from './utils/handlerInputs';
import {ssmCommand} from './utils/ssmCommand';
import {terminateInstance} from "./aws/ec2Instances";
import {Instance} from './aws/types';
import {excludeFromAllocation} from "./elasticsearch/elasticsearch";

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {

    const oldestInstance: Instance = event.oldestElasticsearchNode.ec2Instance;
    const newestInstance: Instance = event.newestElasticsearchNode.ec2Instance;

    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        ssmCommand("systemctl stop elasticsearch", oldestInstance.id, false)
                .then(() => terminateInstance(oldestInstance))
                .then(() => excludeFromAllocation("", newestInstance.id)) // Don't exclude any ips
                .then(() => resolve(event))
                .catch(error => {
                    const message = `Failed due to terminate ${oldestInstance.id} due to: ${error}`;
                    console.log(message);
                    reject(message)
                })
    })

}
