import {Instance} from './ec2Instances';
import {ssmCommand} from './ssmCommand';
import {StandardOutputContent} from 'aws-sdk/clients/ssm';

export class ElasticsearchNode {

    ec2Instance: Instance;
    nodeId: string;

    constructor(instance: Instance, nodeId: string) {
        this.ec2Instance = instance;
        this.nodeId = nodeId;
    }

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