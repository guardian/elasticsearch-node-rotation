import {TargetAndNewNodeResponse} from './utils/handlerInputs';
import {Elasticsearch} from './elasticsearch/elasticsearch';

export async function handler(event: TargetAndNewNodeResponse): Promise<TargetAndNewNodeResponse> {
    const elasticsearchClient = new Elasticsearch(event.targetElasticSearchNode.ec2Instance.id)

    return Promise.all([
        elasticsearchClient.getClusterHealth(),
        elasticsearchClient.getDocuments(event.targetElasticSearchNode)
    ]).then(([clusterStatus, documents]) => {
        const hasDocuments = documents.count > 0;
        const clusterIsUnhealthy = !(clusterStatus.status === "green");

        if (clusterIsUnhealthy || hasDocuments) {
            const error = `Check failed: hasDocuments=${hasDocuments} (${event.targetElasticSearchNode.ec2Instance.id} still has ${documents.count} docs) clusterIsUnhealthy=${clusterIsUnhealthy} (status is currently ${clusterStatus.status})`;
            console.log(error);
            throw new Error(error);
        } else return event;
    });
}
