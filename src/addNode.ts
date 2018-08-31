import {describeAsg, getDesiredCapacity, detachInstance} from './aws/autoscaling';
import {AddNodeResponse, ClusterStatusResponse} from './utils/handlerResponses';
import {updateRebalancingStatus} from './elasticsearch/elasticsearch';
import {Instance} from './aws/types';

export async function handler(event: ClusterStatusResponse): Promise<AddNodeResponse> {

    const oldestInstance: Instance = event.oldestElasticsearchNode.ec2Instance;
    const asg: string = process.env.ASG_NAME;

    return new Promise<AddNodeResponse>((resolve, reject) => {
        updateRebalancingStatus(oldestInstance.id, "none")
            .then(() => detachInstance(oldestInstance, asg))
            .then(() => describeAsg(asg))
            .then(getDesiredCapacity)
            .then((currentCapacity: number) => {
                const response: AddNodeResponse = {
                    "oldestElasticsearchNode": event.oldestElasticsearchNode,
                    "expectedClusterSize": currentCapacity + 1
                };
                resolve(response);
            })
            .catch(error => {
                console.log(`Failed to add a new node due to: ${error}`);
                reject(error);
            })
    })

}