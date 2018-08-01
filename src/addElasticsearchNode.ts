import {ssmCommand} from './utils/ssmCommand';
import {increaseAsgSize, describeAsg} from './utils/autoscaling';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';
import {AutoScalingGroupsType} from "aws-sdk/clients/autoscaling";

export async function handler(event): Promise<AddElasticsearchNodeResponse> {

    return new Promise<AddElasticsearchNodeResponse>((resolve, reject) => {

        const instanceId: string = event.instanceId;
        const asg: string = process.env.ASG_NAME;

        const currentCapacity: Promise<number> = describeAsg(asg)
            .then(getDesiredCapacity);

        const disableRebalancing: Promise<{}> = updateRebalancingStatus(instanceId, "none")
            .then((result: StandardOutputContent) => {
                const jsonResult = JSON.parse(result);
                if (jsonResult.acknowledged != true) {
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
                const response: AddElasticsearchNodeResponse = {"instanceId": instanceId, "expectedClusterSize": results[0] + 1 };
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

export function getDesiredCapacity(asgInfo: AutoScalingGroupsType): number {
    const asgsInResponse = asgInfo.AutoScalingGroups.length;
    if (asgsInResponse !== 1) {
        throw `Expected information about a single ASG, but got ${asgsInResponse}`;
    } else {
        return asgInfo.AutoScalingGroups[0].DesiredCapacity;
    }
}