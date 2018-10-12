import {OldAndNewNodeResponse} from './utils/handlerInputs';
import {getClusterHealth, getDocuments} from './elasticsearch/elasticsearch';
import {ElasticsearchClusterStatus, Documents} from './elasticsearch/types';

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {
    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        getClusterHealth(event.oldestElasticsearchNode.ec2Instance.id)
            .then((clusterStatus: ElasticsearchClusterStatus) => {
                if (clusterStatus.status === "green" && clusterStatus.relocating_shards === 0) {
                    console.log(`Cluster status is green and all shard relocations have finished`);
                    return getDocuments(event.oldestElasticsearchNode);
                } else {
                    const error = `Migration check failed, cluster status is ${JSON.stringify(clusterStatus)}`;
                    console.log(error);
                    reject(error)
                }
            })
            .then((documents: Documents) => {
                if (documents.count === 0) {
                    console.log(`There are no documents on ${JSON.stringify(event.oldestElasticsearchNode)}`);
                    resolve(event)
                } else {
                    const error = `Document check failed, there are still ${documents.count} on ${JSON.stringify(event.oldestElasticsearchNode)}`;
                    console.log(error);
                    reject(error)
                }
            })
            .catch( error => {
                console.log(error);
                reject(error)
            })
    })
}
