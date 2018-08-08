import {ClusterStatusResponse, DefaultResponse} from './utils/handlerResponses';
import {getClusterHealth} from './elasticsearch/elasticsearch';
import {ElasticsearchClusterStatus} from './elasticsearch/types';

export async function handler(event: DefaultResponse): Promise<ClusterStatusResponse> {
    return getClusterHealth(event.oldestElasticsearchNode.ec2Instance.id)
        .then( (clusterStatus: ElasticsearchClusterStatus) => {
            const response: ClusterStatusResponse = {
                "oldestElasticsearchNode": event.oldestElasticsearchNode,
                "clusterStatus": clusterStatus.status
            };
            return response;
        })
}
