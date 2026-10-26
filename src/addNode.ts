import { launchNewInstance } from './aws/autoscaling';
import { AddNodeResponse, ClusterStatusResponse, requireRotationPlan } from './utils/handlerInputs';
import { Elasticsearch } from './elasticsearch/elasticsearch';

export async function handler(event: ClusterStatusResponse): Promise<AddNodeResponse> {
    const rotationPlan = requireRotationPlan(event);
    const target = event.targetElasticSearchNode.ec2Instance;
    const elasticsearchClient = new Elasticsearch(target.id);

    await elasticsearchClient.updateRebalancingStatus('none');
    await launchNewInstance(target, event.destinationAsgName, rotationPlan);

    return { ...event, expectedClusterSize: rotationPlan.expectedClusterSize };
}
