import {OldAndNewNodeResponse} from './utils/handlerInputs';
import {Elasticsearch} from './elasticsearch/elasticsearch';

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {

    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        const oldInstance = event.oldestElasticsearchNode.ec2Instance;
        const elasticsearchClient = new Elasticsearch(oldInstance.id)

        elasticsearchClient.excludeFromAllocation(oldInstance.privateIp)
            .then(() => elasticsearchClient.updateRebalancingStatus("all"))
            .then(() => resolve(event))
            .catch(error => {
                console.log(`Failed to perform shard migration due to: ${error}`);
                reject(error);
            });
    })
}
