import {DefaultResponse} from './utils/handlerResponses';
import {getClusterHealth} from "./elasticsearch/elasticsearch";
import {ElasticsearchClusterStatus} from "./elasticsearch/types";

export async function handler(event: DefaultResponse): Promise<DefaultResponse> {
    return new Promise<DefaultResponse>((resolve, reject) => {
        getClusterHealth(event.oldestElasticsearchNode.ec2Instance.id)
            .then((clusterStatus: ElasticsearchClusterStatus) => {
                if (clusterStatus.status === "green" && clusterStatus.relocating_shards === 0) {
                    resolve(event)
                } else {
                    const error = `Check failed, cluster status is ${JSON.stringify(clusterStatus)}`;
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