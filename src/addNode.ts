import {ssmCommand} from './utils/ssmCommand';
import {increaseAsgSize, describeAsg, getDesiredCapacity} from './aws/autoscaling';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';
import {AddElasticsearchNodeResponse, ClusterStatusResponse} from './utils/handlerResponses';

export async function handler(event: ClusterStatusResponse): Promise<AddElasticsearchNodeResponse> {

    return new Promise<AddElasticsearchNodeResponse>((resolve, reject) => {

        const instanceId: string = event.oldestElasticsearchNode.ec2Instance.id;
        const asg: string = process.env.ASG_NAME;

        const currentCapacity: Promise<number> = describeAsg(asg)
            .then(getDesiredCapacity);

        const disableRebalancing: Promise<{}> = updateRebalancingStatus(instanceId, "none")
            .then((result: StandardOutputContent) => {
                const jsonResult = JSON.parse(result);
                if (jsonResult.acknowledged !== true) {
                    const error = `Unexpected Elasticsearch response, we got: ${JSON.stringify(jsonResult)}`;
                    reject(error);
                } else {
                    return currentCapacity;
                }
            })
            .then(capacity => {
                return increaseAsgSize(asg, capacity);
            });

        return Promise.all([currentCapacity, disableRebalancing])
            .then(results => {
                const response: AddElasticsearchNodeResponse = {
                    "oldestElasticsearchNode": event.oldestElasticsearchNode,
                    "expectedClusterSize": results[0] + 1
                };
                resolve(response);
            })
            .catch(
                error => reject(error)
            )

    });

}

function updateRebalancingStatus(instanceId: string, status: string): Promise<StandardOutputContent> {
    const disableRebalancingCommand: object =
        {
            "persistent": {
                "cluster.routing.rebalance.enable": status
            }
        };
    const elasticsearchCommand = `curl -f -v -X PUT "localhost:9200/_cluster/settings" -H 'Content-Type: application/json' -d '${JSON.stringify(disableRebalancingCommand)}'`;
    return ssmCommand(elasticsearchCommand, instanceId);
}