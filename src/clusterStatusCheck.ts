import {ssmCommand} from './utils/ssmCommand';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';

export async function handler(instanceId: string): Promise<Object> {
    return ssmCommand('curl localhost:9200/_cluster/health', instanceId)
        .then((result: StandardOutputContent) => {
            const json = JSON.parse(result);
            return { "instanceId": instanceId, "clusterStatus": json.status } ;
        })
}
