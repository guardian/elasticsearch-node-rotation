import {ssmCommand} from './utils/ssmCommand';
import {increaseAsgSize, describeAsg} from './utils/autoscaling';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';

export async function handler(event) {

    return new Promise((resolve, reject) => {
        const instanceId: string = event.instanceId;
        const asg: string = process.env.ASG_NAME;
        const disableRebalancingCommand: Object =
            {
                "persistent": {
                    "cluster.routing.rebalance.enable": "none"
                }
            };
        const elasticsearchCommand = `curl -f -v -X PUT "localhost:9200/_cluster/settings" -H 'Content-Type: application/json' -d '${JSON.stringify(disableRebalancingCommand)}'`;

        const currentCapacity: Promise<number> = describeAsg(asg)
            .then(
                asgInfo => {
                    return asgInfo.AutoScalingGroups[0].DesiredCapacity;
                }
            );

        const updateActions = ssmCommand(elasticsearchCommand, instanceId)
            .then((result: StandardOutputContent) => {
                const jsonResult = JSON.parse(result);
                if (jsonResult.acknowledged != true) {
                    const error = `Unexpected Elasticsearch response, we got: ${JSON.stringify(jsonResult)}`;
                    reject(error);
                }
            })
            .then(() => currentCapacity)
            .then(capacity => {
                return increaseAsgSize(asg, capacity);
            });

        return Promise.all([currentCapacity, updateActions])
            .then(results => {
                const response = {"instanceId": instanceId, "expectedClusterSize": results[0] + 1 };
                resolve(response)
            })
            .catch(
                error => reject(error)
            )

    });

}