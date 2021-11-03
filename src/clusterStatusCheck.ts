import {ClusterStatusResponse, OldestNodeResponse} from './utils/handlerInputs';
import {Elasticsearch} from './elasticsearch/elasticsearch';

export async function handler(event: OldestNodeResponse): Promise<ClusterStatusResponse> {
    const elasticsearchClient = new Elasticsearch(event.oldestElasticsearchNode.ec2Instance.id)

    try {
        const clusterStatus = await elasticsearchClient.getClusterHealth()

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
