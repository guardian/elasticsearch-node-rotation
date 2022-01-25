import {AsgInput, ClusterStatusResponse} from './utils/handlerInputs';
import {Elasticsearch} from './elasticsearch/elasticsearch';

export async function handler(event: AsgInput): Promise<ClusterStatusResponse> {
    const elasticsearchClient = new Elasticsearch(event.targetElasticSearchNode.ec2Instance.id)

    try {
        const clusterStatus = await elasticsearchClient.getClusterHealth()

        return ({
            ...event,
            "clusterStatus": clusterStatus.status
        })
    } catch (error) {
        console.log(`Failed to get cluster status due to: ${error}`)
        throw(error)
    }

}
