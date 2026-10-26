import { TargetAndNewNodeResponse, requireClusterSettingsPlan } from './utils/handlerInputs';
import { Elasticsearch } from './elasticsearch/elasticsearch';

export async function handler(event: TargetAndNewNodeResponse): Promise<TargetAndNewNodeResponse> {
    const plan = requireClusterSettingsPlan(event);
    const targetInstance = event.targetElasticSearchNode.ec2Instance;
    const elasticsearchClient = new Elasticsearch(targetInstance.id);
    await elasticsearchClient.applyMigrationSettings(plan.clusterSettings, targetInstance.privateIp);
    return event;
}
