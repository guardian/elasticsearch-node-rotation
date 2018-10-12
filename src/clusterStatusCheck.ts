import {ClusterStatusResponse, OldestNodeResponse} from './utils/handlerInputs';
import {getClusterHealth} from './elasticsearch/elasticsearch';
import {ElasticsearchClusterStatus} from './elasticsearch/types';
import {describeAsg} from "./aws/autoscaling";
import {AutoScalingGroupsType} from "aws-sdk/clients/autoscaling";

export async function handler(event: OldestNodeResponse): Promise<ClusterStatusResponse> {
    return new Promise<ClusterStatusResponse>((resolve, reject) => {
        Promise.all([
            describeAsg(event.asgName),
            getClusterHealth(event.oldestElasticsearchNode.ec2Instance.id)
        ]).then(([asg, clusterStatus]: [AutoScalingGroupsType, ElasticsearchClusterStatus]) => {
            const unhealthyInstanceCount: number = asg.AutoScalingGroups[0].Instances.filter(i => i.HealthStatus !== 'Healthy').length;

            if (unhealthyInstanceCount === 0) {
                const response: ClusterStatusResponse = {
                    "asgName": event.asgName,
                    "oldestElasticsearchNode": event.oldestElasticsearchNode,
                    "clusterStatus": clusterStatus.status
                };
                resolve(response);
            } else {
                const error = `ASG has ${unhealthyInstanceCount} unhealthy instances`;
                console.log(error);
                reject(error)
            }
        })
        .catch( error => {
            console.log(`Failed to get cluster status due to: ${error}`);
            reject(error)
        })
    })
}
