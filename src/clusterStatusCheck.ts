import {ssmCommand} from './utils/ssmCommand';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';

export async function handler(instanceId: string): Promise<ClusterStatusResponse> {
    return ssmCommand('curl localhost:9200/_cluster/health', instanceId)
        .then((result: StandardOutputContent) => {
            const json = JSON.parse(result);
            const response: ClusterStatusResponse = { "instanceId": instanceId, "clusterStatus": json.status };
            return response;
        })
}
