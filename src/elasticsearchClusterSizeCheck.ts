import {ssmCommand} from './utils/ssmCommand';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';
import {AddElasticsearchNodeResponse, ClusterSizeCheckResponse} from './handlerResponses';
import {ElasticsearchNode, getElasticsearchNode} from './utils/elasticsearch';
import {getInstances, getSpecificInstance, Instance} from './utils/ec2Instances';

export async function handler(event: AddElasticsearchNodeResponse): Promise<ClusterSizeCheckResponse> {

    const asg: string = process.env.ASG_NAME;

    const newestNode: Promise<ElasticsearchNode> = getInstances(asg)
        .then(instances => getSpecificInstance(instances, findNewestInstance))
        .then(getElasticsearchNode);

    return new Promise<ClusterSizeCheckResponse>((resolve, reject) => {
        ssmCommand('curl localhost:9200/_cluster/health', event.oldestElasticsearchNode.ec2Instance.id)
            .then((result: StandardOutputContent) => {
                const json = JSON.parse(result);
                const nodesInCluster = json.number_of_nodes;
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