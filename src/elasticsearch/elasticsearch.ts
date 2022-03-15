import {Instance} from '../aws/types';
import {Documents, ElasticsearchClusterStatus, ElasticsearchNode, NodeStats,} from './types';
import {ssmCommand} from '../utils/ssmCommand';
import {retry} from '../utils/helperFunctions';

export class Elasticsearch {
    instanceId: string;

    constructor(instanceId: string) {
        this.instanceId = instanceId;
    }

    execute(commandPath: string, requestJson?: object): Promise<any> {
        const requestJsonSettings = requestJson ? `-X PUT -H 'Content-Type: application/json' -d '${JSON.stringify(requestJson)}'` : "";
        return ssmCommand(`curl localhost:9200${commandPath} ${requestJsonSettings}`, this.instanceId)
            .then((result: string) => {
                return JSON.parse(result);
            })
    }

    executeCommand(commandPath: string, requestJson: object, taskName: string): Promise<boolean> {
        return retry(() => this.execute(commandPath, requestJson).then((jsonResult: any) => {
            if (!(jsonResult.acknowledged === true)) {
                throw `unexpected Elasticsearch response when attempting to ${taskName}, we got: ${JSON.stringify(jsonResult)}`;
            } else {
                return true;
            }
        }), taskName, 5);
    }

    getClusterHealth(): Promise<ElasticsearchClusterStatus> {
        return this.execute('/_cluster/health')
    }

    getElasticsearchNode(instance: Instance): Promise<ElasticsearchNode> {
        console.log(`Searching for Elasticsearch node with private ip: ${instance.privateIp}`);
        return this.execute(`/_nodes/${instance.privateIp}`).then((json: any) => {
            if (json._nodes.total === 1) {
                console.log(`Node json: ${json}`);
                const nodeId: string = Object.keys(json.nodes)[0];
                const isMaster: boolean = json.nodes[nodeId].settings.node.master == 'true';
                return new ElasticsearchNode(instance, nodeId, isMaster);
            } else {
                throw `expected information about a single node, but got: ${JSON.stringify(json)}`;
            }
        })
    }

    getDocuments(node: ElasticsearchNode): Promise<Documents> {
        return this.execute(`/_nodes/${node.ec2Instance.privateIp}/stats`)
            .then((nodeStats: NodeStats) => { return nodeStats.nodes[node.nodeId].indices.docs; });
    }

    setClusterSetting(settingName: string, settingValue: string): Promise<boolean> {
        return this.executeCommand("/_cluster/settings", {
            "transient": { [settingName]: settingValue }
        }, `setting cluster setting ${settingName} to '${settingValue}'`)
    }

    updateRebalancingStatus(status: string): Promise<boolean> {
        return this.setClusterSetting("cluster.routing.rebalance.enable", status);
    }

    excludeFromAllocation(ip: string): Promise<boolean> {
        return this.setClusterSetting("cluster.routing.allocation.exclude._ip", ip);
    }
}

