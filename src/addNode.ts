import {detachInstance} from './aws/autoscaling';
import {AddNodeResponse, ClusterStatusResponse} from './utils/handlerInputs';
import {Elasticsearch} from './elasticsearch/elasticsearch';
import {Instance} from './aws/types';
import {ElasticsearchClusterStatus} from './elasticsearch/types';

export async function handler(event: ClusterStatusResponse): Promise<AddNodeResponse> {

    const targetInstance: Instance = event.targetElasticSearchNode.ec2Instance;
    const asg: string = event.asgName;
    const elasticsearchClient = new Elasticsearch(targetInstance.id)

    return new Promise<AddNodeResponse>((resolve, reject) => {

        elasticsearchClient.updateRebalancingStatus("none")
            .then(() => detachInstance(targetInstance, asg))
            .then(() => elasticsearchClient.getClusterHealth())
            .then((clusterStatus: ElasticsearchClusterStatus) => {
                const response: AddNodeResponse = {
                    "asgName": asg,
                    "targetElasticSearchNode": event.targetElasticSearchNode,
                    "expectedClusterSize": clusterStatus.number_of_nodes + 1
                };
                resolve(response);
            })
            .catch(error => {
                console.log(`Failed to add a new node due to: ${error}`);
                reject(error);
            })
    })

}
