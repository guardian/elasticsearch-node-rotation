import {ssmCommand} from './utils/ssmCommand';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';

export async function handler(event): Promise<Object> {
    return new Promise((resolve, reject) => {
        ssmCommand('curl localhost:9200/_cluster/health', event.instanceId)
            .then((result: StandardOutputContent) => {
                const json = JSON.parse(result);
                const nodesInCluster = json.number_of_nodes;
                if (nodesInCluster == event.expectedClusterSize) {
                    resolve({ "instanceId": event.instanceId })
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