import {ssmCommand} from './utils/ssmCommand';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';
import {ClusterStatusResponse, DefaultResponse} from './handlerResponses';

export async function handler(event: DefaultResponse): Promise<ClusterStatusResponse> {
    return ssmCommand('curl localhost:9200/_cluster/health', event.oldestElasticsearchNode.ec2Instance.id)
        .then((result: StandardOutputContent) => {
            const json = JSON.parse(result);
            const response: ClusterStatusResponse = {
                "oldestElasticsearchNode": event.oldestElasticsearchNode,
                "clusterStatus": json.status
            };
            return response;
        })
}
