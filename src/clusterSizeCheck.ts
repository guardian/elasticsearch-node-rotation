import {AddElasticsearchNodeResponse, ClusterSizeCheckResponse} from './utils/handlerResponses';
import {getClusterHealth, getElasticsearchNode} from './elasticsearch/elasticsearch';
import {getInstances, getSpecificInstance} from './aws/ec2Instances';
import {ElasticsearchClusterStatus, ElasticsearchNode} from './elasticsearch/types';
import {Instance} from './aws/types';

export async function handler(event: AddElasticsearchNodeResponse): Promise<ClusterSizeCheckResponse> {

    const asg: string = process.env.ASG_NAME;

    const newestNode: Promise<ElasticsearchNode> = getInstances(asg)
        .then(instances => getSpecificInstance(instances, findNewestInstance))
        .then(getElasticsearchNode);

    return new Promise<ClusterSizeCheckResponse>((resolve, reject) => {
        getClusterHealth(event.oldestElasticsearchNode.ec2Instance.id)
            .then((clusterStatus: ElasticsearchClusterStatus) => {
                const nodesInCluster = clusterStatus.number_of_nodes;
                if (nodesInCluster === event.expectedClusterSize) {
                    newestNode.then( newestElasticsearchNode => {
                        const response: ClusterSizeCheckResponse = {
                            "oldestElasticsearchNode": event.oldestElasticsearchNode,
                            "newestElasticsearchNode": newestElasticsearchNode
                        };
                        resolve(response);
                    });
                } else {
                    const error = `Found ${nodesInCluster} nodes but expected to find ${event.expectedClusterSize}`;
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

function findNewestInstance(instances: Instance[]): Instance {
    const sortedInstances: Instance[] = instances.sort(function(a,b){return a.launchTime.getTime() - b.launchTime.getTime()}).reverse();
    const newestInstance: Instance = sortedInstances[0];
    console.log(`Newest instance ${newestInstance.id} was launched at ${newestInstance.launchTime}`);
    return newestInstance;
}