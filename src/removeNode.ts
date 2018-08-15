import {OldAndNewNodeResponse} from './utils/handlerResponses';
import {ssmCommand} from './utils/ssmCommand';
import {terminateOldestInstance} from './aws/autoscaling';
import {updateRebalancingStatus} from "./elasticsearch/elasticsearch";

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {

    const oldestInstanceId: string = event.oldestElasticsearchNode.ec2Instance.id;

    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        ssmCommand("systemctl stop elasticsearch", oldestInstanceId, false)
                .then(() => terminateOldestInstance(oldestInstanceId))
                .then(() => updateRebalancingStatus(event.newestElasticsearchNode.ec2Instance.id, "all"))
                .then(() => resolve(event))
                .catch(error => {
                    const message = `Failed due to terminate ${oldestInstanceId} due to: ${error}`;
                    console.log(message);
                    reject(message)
                })
    })

}