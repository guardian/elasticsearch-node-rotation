import {increaseAsgSize, describeAsg, getDesiredCapacity} from './aws/autoscaling';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';
import {AddNodeResponse, ClusterStatusResponse} from './utils/handlerResponses';
import {updateRebalancingStatus} from './elasticsearch/elasticsearch';

export async function handler(event: ClusterStatusResponse): Promise<AddNodeResponse> {

    return new Promise<AddNodeResponse>((resolve, reject) => {

        const instanceId: string = event.oldestElasticsearchNode.ec2Instance.id;
        const asg: string = process.env.ASG_NAME;

        const currentCapacity: Promise<number> = describeAsg(asg)
            .then(getDesiredCapacity);

        const disableRebalancing: Promise<{}> = updateRebalancingStatus(instanceId, "none")
            .then(() => {
                return currentCapacity;
            })
            .then(capacity => {
                return increaseAsgSize(asg, capacity);
            });

        return Promise.all([currentCapacity, disableRebalancing])
            .then(results => {
                const response: AddNodeResponse = {
                    "oldestElasticsearchNode": event.oldestElasticsearchNode,
                    "expectedClusterSize": results[0] + 1
                };
                resolve(response);
            })
            .catch(
                error => reject(error)
            )

    });

}