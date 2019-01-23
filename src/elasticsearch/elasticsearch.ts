import {Instance} from '../aws/types';
import {
    Documents,
    ElasticsearchClusterStatus,
    ElasticsearchNode,
    NodeStats,
} from './types';
import {ssmCommand} from '../utils/ssmCommand';

export function getClusterHealth(instanceId: string): Promise<ElasticsearchClusterStatus> {
    return ssmCommand('curl localhost:9200/_cluster/health', instanceId)
        .then((result: string) => {
            const clusterStatus: ElasticsearchClusterStatus = JSON.parse(result);
            return clusterStatus;
        })
}

export function getElasticsearchNode(instance: Instance): Promise<ElasticsearchNode> {
    console.log(`Searching for Elasticsearch node with private ip: ${instance.privateIp}`);
    return ssmCommand(`curl localhost:9200/_nodes/${instance.privateIp}`, instance.id)
        .then((result: string) => {
            const json = JSON.parse(result);
            if (json._nodes.total === 1) {
                const nodeId: string = Object.keys(json.nodes)[0];
                const isMaster: boolean = json.nodes[nodeId].settings.node.master == 'true';
                return new ElasticsearchNode(instance, nodeId, isMaster);
            } else {
                throw `expected information about a single node, but got: ${JSON.stringify(json)}`;
            }
        })
}

export function getDocuments(node: ElasticsearchNode): Promise<Documents> {
    return ssmCommand(`curl localhost:9200/_nodes/${node.ec2Instance.privateIp}/stats`, node.ec2Instance.id)
        .then(response => {
            const nodeStats: NodeStats = JSON.parse(response);
            return nodeStats.nodes[node.nodeId].indices.docs;
        });
}

export function updateRebalancingStatus(instanceId: string, status: string): Promise<boolean> {
    const disableRebalancingCommand: object =
        {
            "transient": {
                "cluster.routing.rebalance.enable": status
            }
        };
    const elasticsearchCommand = `curl -X PUT "localhost:9200/_cluster/settings" -H 'Content-Type: application/json' -d '${JSON.stringify(disableRebalancingCommand)}'`;
    return ssmCommand(elasticsearchCommand, instanceId)
        .then((rawResponse: string) => {
            if (!successfulAction(rawResponse)) {
                throw `unexpected Elasticsearch response when attempting to update re-balancing status, we got: ${rawResponse}`;
            } else {
                console.log(`Successfully updated re-balancing status of cluster to: ${status}`);
                return true;
            }
        })
}

export function excludeFromAllocation(ip: string, instanceId: string): Promise<boolean> {
    const setting = {
        "transient" : {
            "cluster.routing.allocation.exclude._ip" : ip
        }
    };
    const command = `curl -X PUT "localhost:9200/_cluster/settings" -H 'Content-Type: application/json' -d '${JSON.stringify(setting)}'`;

    return ssmCommand(command, instanceId)
        .then((rawResponse: string) => {
            if (!successfulAction(rawResponse)) {
                throw `Unexpected Elasticsearch response when attempting to exclude ${ip} from shard allocation, got: ${rawResponse}`;
            } else {
                console.log(`Successfully excluded ${ip} from shard allocation`);
                return true;
            }
        });
}

function successfulAction(rawResponse: string): boolean {
    const jsonResult = JSON.parse(rawResponse);
    return jsonResult.acknowledged === true;
}
