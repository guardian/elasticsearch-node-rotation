import { launchNewInstance } from './aws/autoscaling';
import { AddNodeResponse, ClusterStatusResponse, requireClusterSettingsPlan } from './utils/handlerInputs';
import { Elasticsearch } from './elasticsearch/elasticsearch';

export async function handler(event: ClusterStatusResponse): Promise<AddNodeResponse> {
    const rotationPlan = requireClusterSettingsPlan(event);
    const target = event.targetElasticSearchNode.ec2Instance;
    const elasticsearchClient = new Elasticsearch(target.id);

    await elasticsearchClient.disableRebalancing(rotationPlan.clusterSettings);
    await launchNewInstance(target, event.destinationAsgName, rotationPlan);

    return event;
}
