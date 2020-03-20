import {ClusterStatusResponse, OldestNodeResponse} from './utils/handlerInputs';
import {getClusterHealth} from './elasticsearch/elasticsearch';

export async function handler(event: OldestNodeResponse): Promise<ClusterStatusResponse> {
    try {
        const clusterStatus = await getClusterHealth(event.oldestElasticsearchNode.ec2Instance.id)

        return ({
            "asgName": event.asgName,
            "oldestElasticsearchNode": event.oldestElasticsearchNode,
            "clusterStatus": clusterStatus.status
        })
    } catch (error) {
        console.log(`Failed to get cluster status due to: ${error}`)
        throw(error)
    }

}
