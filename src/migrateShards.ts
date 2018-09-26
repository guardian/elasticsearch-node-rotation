import {OldAndNewNodeResponse} from './utils/handlerInputs';
import {
    excludeFromAllocation,
    updateRebalancingStatus
} from './elasticsearch/elasticsearch';

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {

    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        const oldInstance = event.oldestElasticsearchNode.ec2Instance;

        excludeFromAllocation(oldInstance.privateIp, oldInstance.id)
            .then(() => updateRebalancingStatus(oldInstance.id, "all"))
            .then(() => resolve(event))
            .catch(error => {
                console.log(`Failed to perform shard migration due to: ${error}`);
                reject(error);
            });
    })
}
