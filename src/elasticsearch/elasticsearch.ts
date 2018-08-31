import {Instance} from '../aws/types';
import {
    Documents,
    ElasticsearchClusterStatus,
    ElasticsearchNode,
    Move,
    MoveCommand,
    NodeStats,
    RerouteCommand,
    RoutingTable
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
                return new ElasticsearchNode(instance, nodeId);
            } else {
                throw `expected information about a single node, but got: ${JSON.stringify(json)}`;
            }
        })
}

export function getRoutingTable(instanceId: string): Promise<RoutingTable> {
    return ssmCommand(`curl localhost:9200/_cluster/state/routing_table`, instanceId)
        .then(JSON.parse)
        .then(json => new RoutingTable(json));
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
            "persistent": {
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

export function migrateShards(moves: Move[], oldestElasticsearchNode: ElasticsearchNode): Promise<boolean> {

    function buildMoveCommand(move: Move): MoveCommand {
        return { "move": move };
    }

    const commands: MoveCommand[] = moves.map(buildMoveCommand);
    const rerouteCommand: RerouteCommand = {
        commands
    };
    console.log(`Re-route command will be: ${JSON.stringify(rerouteCommand)}`);
    const elasticsearchCommand = `curl -X POST "localhost:9200/_cluster/reroute" -H 'Content-Type: application/json' -d '${JSON.stringify(rerouteCommand)}'`;
    return ssmCommand(elasticsearchCommand, oldestElasticsearchNode.ec2Instance.id)
        .then((rawResponse: string) => {
            if (!successfulAction(rawResponse)) {
                throw `unexpected Elasticsearch response when attempting to migrate shards, we got: ${rawResponse}`;
            } else {
                console.log(`Successfully began migrating shards off ES node: ${JSON.stringify(oldestElasticsearchNode)}`);
                return true;
            }
        })

}

function successfulAction(rawResponse: string): boolean {
    const jsonResult = JSON.parse(rawResponse);
    return jsonResult.acknowledged === true;
}
