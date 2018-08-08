import {OldAndNewNodeResponse} from './utils/handlerResponses';
import {ssmCommand} from './utils/ssmCommand';
import {terminateOldestInstance} from './aws/autoscaling';
import {ActivityType} from 'aws-sdk/clients/autoscaling';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';
import {updateRebalancingStatus} from "./elasticsearch/elasticsearch";

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {

    const oldestInstanceId: string = event.oldestElasticsearchNode.ec2Instance.id;

    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        ssmCommand("systemctl stop elasticsearch", oldestInstanceId)
                .then((result: StandardOutputContent) => {
                    console.log(`Shutdown elasticsearch result: ${result}`);
                    return terminateOldestInstance(oldestInstanceId);
                })
                .then((terminationResult: ActivityType) => {
                    console.log(JSON.stringify(terminationResult));
                    updateRebalancingStatus(event.newestElasticsearchNode.ec2Instance.id, "all");
                })
                .then(() => {
                    resolve(event);
                })
                .catch(error => {
                    const message = `Failed due to ${error}`;
                    console.log(message);
                    reject(message)
                })
    })

}