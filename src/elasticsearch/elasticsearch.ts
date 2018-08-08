import {Instance} from '../aws/types';
import {ElasticsearchClusterStatus, ElasticsearchNode, Move, MoveCommand, RerouteCommand} from './types';
import {ssmCommand} from '../utils/ssmCommand';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';
import {DefaultResponse} from '../utils/handlerResponses';

export function getClusterHealth(instanceId: string): Promise<ElasticsearchClusterStatus> {
    return ssmCommand('curl localhost:9200/_cluster/health', instanceId)
        .then((result: StandardOutputContent) => {
            const clusterStatus: ElasticsearchClusterStatus = JSON.parse(result);
            return clusterStatus;
        })
}

export function getElasticsearchNode(instance: Instance): Promise<ElasticsearchNode> {
    console.log(`Searching for Elasticsearch node with private ip: ${instance.privateIp}`);
    return ssmCommand(`curl localhost:9200/_nodes/${instance.privateIp}`, instance.id)
        .then((result: StandardOutputContent) => {
            const json = JSON.parse(result);
            if (json._nodes.total === 1) {
                const nodeId: string = Object.keys(json.nodes)[0];
                return new ElasticsearchNode(instance, nodeId);
            } else {
                throw `Expected information about a single node, but got: ${JSON.stringify(json)}`;
            }
        })
}

export function getShardInfo(instanceId: string): Promise<object> {
    return ssmCommand(`curl localhost:9200/_cluster/state/routing_table`, instanceId)
        .then(JSON.parse);
}


export function migrateShards(moves: Move[], oldestElasticsearchNode: ElasticsearchNode): Promise<DefaultResponse> {
    const commands: MoveCommand[] = moves.map(buildMoveCommand);
    const rerouteCommand: RerouteCommand = {
        commands
    };
    console.log(`Re-route command will be: ${JSON.stringify(rerouteCommand)}`);
    const elasticsearchCommand = `curl -f -v -X POST "localhost:9200/_cluster/reroute" -H 'Content-Type: application/json' -d '${JSON.stringify(rerouteCommand)}'`;
    return ssmCommand(elasticsearchCommand, oldestElasticsearchNode.ec2Instance.id)
        .then(() => {
                const response: DefaultResponse = {"oldestElasticsearchNode": oldestElasticsearchNode};
                return response;
            }
        )
}

function buildMoveCommand(move: Move): MoveCommand {
    return { "move": move };
}