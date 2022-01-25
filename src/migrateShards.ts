import {TargetAndNewNodeResponse} from './utils/handlerInputs';
import {Elasticsearch} from './elasticsearch/elasticsearch';

export async function handler(event: TargetAndNewNodeResponse): Promise<TargetAndNewNodeResponse> {

    return new Promise<TargetAndNewNodeResponse>((resolve, reject) => {
        const targetInstance = event.targetElasticSearchNode.ec2Instance;
        const elasticsearchClient = new Elasticsearch(targetInstance.id)

        elasticsearchClient.excludeFromAllocation(targetInstance.privateIp)
            .then(() => elasticsearchClient.updateRebalancingStatus("all"))
            .then(() => resolve(event))
            .catch(error => {
                console.log(`Failed to perform shard migration due to: ${error}`);
                reject(error);
            });
    })
}
