import {OldAndNewNodeResponse} from './utils/handlerInputs';
import {getClusterHealth, getDocuments} from './elasticsearch/elasticsearch';

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {
    return Promise.all([
        getClusterHealth(event.oldestElasticsearchNode.ec2Instance.id),
        getDocuments(event.oldestElasticsearchNode)
    ]).then(([clusterStatus, documents]) => {
        const hasDocuments = documents.count > 0;
        const clusterIsUnhealthy = !(clusterStatus.status === "green");

        if (clusterIsUnhealthy || hasDocuments) {
            const error = `Check failed: hasDocuments=${hasDocuments} clusterIsUnhealthy=${clusterIsUnhealthy}`;
            console.log(error);
            throw new Error(error);
        } else return event;
    });
}
