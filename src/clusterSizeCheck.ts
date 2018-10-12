import {AddNodeResponse, OldAndNewNodeResponse} from './utils/handlerInputs';
import {getClusterHealth, getElasticsearchNode} from './elasticsearch/elasticsearch';
import {getInstances, getSpecificInstance} from './aws/ec2Instances';
import {ElasticsearchClusterStatus, ElasticsearchNode} from './elasticsearch/types';
import {Instance} from './aws/types';

export async function handler(event: AddNodeResponse): Promise<OldAndNewNodeResponse> {

    const asg: string = event.asgName;

    const newestNode: Promise<ElasticsearchNode> = getInstances(asg)
        .then(instances => getSpecificInstance(instances, findNewestInstance))
        .then(getElasticsearchNode);

    return new Promise<OldAndNewNodeResponse>((resolve, reject) => {
        getClusterHealth(event.oldestElasticsearchNode.ec2Instance.id)
            .then((clusterStatus: ElasticsearchClusterStatus) => {
                const nodesInCluster = clusterStatus.number_of_nodes;
                if (nodesInCluster === event.expectedClusterSize) {
                    return newestNode;
                } else {
                    const error = `Found ${nodesInCluster} nodes but expected to find ${event.expectedClusterSize}`;
                    console.log(error);
                    reject(error)
                }
            })
            .then( (newestElasticsearchNode: ElasticsearchNode) => {
                const response: OldAndNewNodeResponse = {
                    "asgName": asg,
                    "oldestElasticsearchNode": event.oldestElasticsearchNode,
                    "newestElasticsearchNode": newestElasticsearchNode
                };
                resolve(response);
            })
            .catch( error => {
                console.log(`Failed to get cluster status due to: ${error}`);
                reject(error)
            })
    })
}

function findNewestInstance(instances: Instance[]): Instance {
    const sortedInstances: Instance[] = instances.sort(function(a,b){return a.launchTime.getTime() - b.launchTime.getTime()}).reverse();
    const newestInstance: Instance = sortedInstances[0];
    console.log(`Newest instance ${newestInstance.id} was launched at ${newestInstance.launchTime}`);
    return newestInstance;
}
