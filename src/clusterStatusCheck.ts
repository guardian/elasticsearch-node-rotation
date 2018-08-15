import {ClusterStatusResponse, OldestNodeResponse} from './utils/handlerResponses';
import {getClusterHealth} from './elasticsearch/elasticsearch';
import {ElasticsearchClusterStatus} from './elasticsearch/types';

export async function handler(event: OldestNodeResponse): Promise<ClusterStatusResponse> {
    return new Promise<ClusterStatusResponse>((resolve, reject) => {
        getClusterHealth(event.oldestElasticsearchNode.ec2Instance.id)
            .then( (clusterStatus: ElasticsearchClusterStatus) => {
                const response: ClusterStatusResponse = {
                    "oldestElasticsearchNode": event.oldestElasticsearchNode,
                    "clusterStatus": clusterStatus.status
                };
                resolve(response);
            })
            .catch( error => {
                console.log(`Failed to get cluster status due to: ${error}`);
                reject(error)
            })
    })
}
