import {Instance} from '../aws/types';
import { ElasticsearchClusterStatus, ElasticsearchNode } from './types';
import {ssmCommand} from '../utils/ssmCommand';
import { ClusterSettingsSnapshot, validateClusterSettings } from '../utils/handlerInputs';

const rebalanceSetting = 'cluster.routing.rebalance.enable';
const exclusionSetting = 'cluster.routing.allocation.exclude._ip';

function shellQuote(value: string): string {
    return "'" + value.replace(/'/g, "'\"'\"'") + "'";
}

function isRecord(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function migrationExclusions(settings: ClusterSettingsSnapshot, targetIp: string): string {
    if (typeof targetIp !== 'string' || !targetIp || /[,\s]/.test(targetIp)) {
        throw new Error('Missing or invalid migration target IP');
    }
    const baseline = settings.allocationExcludeIp ?? settings.persistentAllocationExcludeIp;
    if (!baseline) {
        return targetIp;
    }
    return baseline.split(',').some((ip) => ip.trim() === targetIp)
        ? baseline
        : `${baseline},${targetIp}`;
}

export class Elasticsearch {
    instanceId: string;

    constructor(instanceId: string) {
        this.instanceId = instanceId;
    }

    execute(commandPath: string, requestJson?: object): Promise<any> {
        const requestJsonSettings = requestJson
            ? `-X PUT -H 'Content-Type: application/json' -d ${shellQuote(JSON.stringify(requestJson))}`
            : '';
        return ssmCommand(`curl --fail --silent --show-error ${shellQuote(`localhost:9200${commandPath}`)} ${requestJsonSettings}`, this.instanceId)
            .then((result: string) => {
                return JSON.parse(result);
            })
    }

    getClusterHealth(): Promise<ElasticsearchClusterStatus> {
        return this.execute('/_cluster/health')
    }

    getElasticsearchNode(instance: Instance): Promise<ElasticsearchNode> {
        console.log(`Searching for Elasticsearch node with private ip: ${instance.privateIp}`);
        return this.execute(`/_nodes/${instance.privateIp}`).then((json: any) => {
            if (json._nodes.total === 1) {
                const nodeId: string = Object.keys(json.nodes)[0];
                const node = json.nodes[nodeId];
                const roles = node.roles ?? node.settings?.node?.roles;
                const master = node.settings?.node?.master ?? node.settings?.['node.master'];
                const isMasterEligible = Array.isArray(roles)
                    ? roles.includes('master')
                    : master === undefined || master === true || master === 'true';
                return new ElasticsearchNode(instance, nodeId, isMasterEligible);
            } else {
                throw `expected information about a single node, but got: ${JSON.stringify(json)}`;
            }
        })
    }

    async getClusterSettings(): Promise<ClusterSettingsSnapshot> {
        const json = await this.execute('/_cluster/settings?flat_settings=true');
        if (!isRecord(json) || !isRecord(json.transient) || !isRecord(json.persistent)) {
            throw new Error('Invalid Elasticsearch cluster settings response');
        }
        const settings: ClusterSettingsSnapshot = {
            rebalanceEnable: json.transient[rebalanceSetting] ?? null,
            allocationExcludeIp: json.transient[exclusionSetting] ?? null,
            persistentAllocationExcludeIp: json.persistent[exclusionSetting] ?? null,
        };
        validateClusterSettings(settings);
        return settings;
    }

    async disableRebalancing(settings: ClusterSettingsSnapshot): Promise<void> {
        validateClusterSettings(settings);
        await this.writeRotationSettings(
            settings,
            settings.allocationExcludeIp,
            'none',
            settings.allocationExcludeIp
        );
    }

    async assertMigrationSettings(settings: ClusterSettingsSnapshot, targetIp: string): Promise<void> {
        const current = await this.getClusterSettings();
        if (
            current.allocationExcludeIp !== migrationExclusions(settings, targetIp) ||
            current.persistentAllocationExcludeIp !== settings.persistentAllocationExcludeIp
        ) {
            throw new Error('Target allocation exclusion changed; reconcile before removal');
        }
    }

    async applyMigrationSettings(settings: ClusterSettingsSnapshot, targetIp: string): Promise<void> {
        validateClusterSettings(settings);
        const exclusions = migrationExclusions(settings, targetIp);
        await this.writeRotationSettings(settings, exclusions, 'all', exclusions);
    }

    async restoreClusterSettings(settings: ClusterSettingsSnapshot, targetIp: string): Promise<void> {
        validateClusterSettings(settings);
        const exclusions = migrationExclusions(settings, targetIp);
        await this.writeRotationSettings(
            settings,
            exclusions,
            settings.rebalanceEnable,
            settings.allocationExcludeIp
        );
    }

    private async writeRotationSettings(
        baseline: ClusterSettingsSnapshot,
        migrationExclusion: string | null,
        rebalanceEnable: string | null,
        allocationExcludeIp: string | null
    ): Promise<void> {
        const current = await this.getClusterSettings();
        if (
            current.persistentAllocationExcludeIp !== baseline.persistentAllocationExcludeIp ||
            ![baseline.rebalanceEnable, 'none', 'all'].includes(current.rebalanceEnable) ||
            ![baseline.allocationExcludeIp, migrationExclusion].includes(current.allocationExcludeIp)
        ) {
            throw new Error('Cluster settings conflict; reconcile the rotation before changing settings');
        }
        if (
            current.rebalanceEnable === rebalanceEnable &&
            current.allocationExcludeIp === allocationExcludeIp
        ) {
            return;
        }

        // Do not retry an uncertain SSM write: a delayed command may still execute later.
        const result = await this.execute('/_cluster/settings', {
            transient: {
                [rebalanceSetting]: rebalanceEnable,
                [exclusionSetting]: allocationExcludeIp,
            },
        });
        if (result?.acknowledged !== true) {
            throw new Error('Elasticsearch did not acknowledge rotation cluster settings');
        }
        const actual = await this.getClusterSettings();
        if (
            actual.rebalanceEnable !== rebalanceEnable ||
            actual.allocationExcludeIp !== allocationExcludeIp ||
            actual.persistentAllocationExcludeIp !== baseline.persistentAllocationExcludeIp
        ) {
            throw new Error('Rotation cluster settings readback verification failed');
        }
    }

    async getAllocatedShardCount(node: ElasticsearchNode): Promise<number> {
        if (typeof node.nodeId !== 'string' || !node.nodeId.trim()) {
            throw new Error('Missing Elasticsearch node ID for allocated shard count');
        }
        const state = await this.execute('/_cluster/state/routing_table');
        if (!isRecord(state?.routing_table?.indices)) {
            throw new Error('Invalid Elasticsearch routing table response');
        }
        let count = 0;
        for (const index of Object.values(state.routing_table.indices)) {
            if (!isRecord(index) || !isRecord(index.shards)) {
                throw new Error('Invalid Elasticsearch routing table index');
            }
            for (const shards of Object.values(index.shards)) {
                if (!Array.isArray(shards) || shards.length === 0) {
                    throw new Error('Invalid Elasticsearch routing table shards');
                }
                for (const shard of shards) {
                    if (
                        !isRecord(shard) ||
                        ![shard.node, shard.relocating_node].every(
                            (id) => id === null || (typeof id === 'string' && id.trim().length > 0)
                        )
                    ) {
                        throw new Error('Invalid Elasticsearch shard allocation');
                    }
                    if (shard.node === node.nodeId || shard.relocating_node === node.nodeId) {
                        count++;
                    }
                }
            }
        }
        return count;
    }
}

