import {OldAndNewNodeResponse} from './utils/handlerInputs';
import {getClusterHealth, getDocuments} from './elasticsearch/elasticsearch';

export async function handler(event: OldAndNewNodeResponse): Promise<OldAndNewNodeResponse> {
    return Promise.all([
        getClusterHealth(event.oldestElasticsearchNode.ec2Instance.id),
        getDocuments(event.oldestElasticsearchNode)
    ]).then(([clusterStatus, documents]) => {
        const hasDocuments = documents.count > 0;
        const isMasterAndShardsRelocating = event.oldestElasticsearchNode.isMasterEligible && clusterStatus.relocating_shards > 0;
        const isClusterNotGreen = !(clusterStatus.status === "green");

        if (isClusterNotGreen || hasDocuments || isMasterAndShardsRelocating) {
            const error =
                `Check failed: hasDocuments=${hasDocuments} isMasterAndShardsRelocating=${isMasterAndShardsRelocating} isClusterNotGreen=${isClusterNotGreen}`;
            console.log(error);
            throw new Error(error);
        } else return event;
    });
}
