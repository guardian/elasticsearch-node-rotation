import { Elasticsearch } from './elasticsearch';
import {
    TargetAndNewNodeResponse,
    requireClusterSettingsPlan,
} from '../utils/handlerInputs';

function record(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requireSafe(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(`Unsafe node removal: ${message}`);
}

function masterEligible(node: any): boolean {
    requireSafe(record(node), 'invalid legacy node');
    if (node.roles !== undefined) {
        requireSafe(
            Array.isArray(node.roles) && node.roles.every(role => typeof role === 'string'),
            'invalid node roles'
        );
        return node.roles.includes('master');
    }
    requireSafe(record(node.settings), 'missing legacy node settings');
    requireSafe(
        node.settings.node === undefined || record(node.settings.node),
        'invalid legacy node settings'
    );
    const master = Object.prototype.hasOwnProperty.call(node.settings, 'node.master')
        ? node.settings['node.master']
        : node.settings.node?.master;
    requireSafe(
        master === undefined || [true, false, 'true', 'false'].includes(master),
        'invalid node.master'
    );
    return master === undefined || master === true || master === 'true';
}

export async function assertSafeToRemove(
    client: Elasticsearch,
    event: TargetAndNewNodeResponse,
    allowTargetAbsent: boolean
): Promise<void> {
    const plan = requireClusterSettingsPlan(event);
    const target = event.targetElasticSearchNode;
    const replacement = event.newestElasticsearchNode;
    requireSafe(
        [target.nodeId, replacement.nodeId].every(id => typeof id === 'string' && !!id.trim()) &&
            target.nodeId !== replacement.nodeId,
        'target and replacement must have distinct node IDs'
    );
    await client.assertMigrationSettings(plan.clusterSettings, target.ec2Instance.privateIp);
    const health = await client.getClusterHealth();
    requireSafe(
        health?.status === 'green' && health.relocating_shards === 0,
        'cluster must be green with zero relocating shards'
    );
    requireSafe(
        await client.getAllocatedShardCount(target) === 0,
        'target still has allocated shards'
    );
    const state = await client.execute(
        '/_cluster/state/nodes,metadata,master_node?filter_path=nodes,master_node,metadata.cluster_coordination'
    );
    requireSafe(record(state?.nodes), 'missing cluster nodes');
    const live = Object.keys(state.nodes);
    requireSafe(
        typeof state.master_node === 'string' && live.includes(state.master_node),
        'no active master'
    );
    const targetPresent = live.includes(target.nodeId);
    requireSafe(targetPresent || allowTargetAbsent, 'target node is absent');
    requireSafe(live.includes(replacement.nodeId), 'replacement node is absent');
    const expected = plan.expectedClusterSize - (targetPresent ? 0 : 1);
    requireSafe(
        health.number_of_nodes === expected && live.length === expected,
        'cluster size drift'
    );
    const actualReplacement = await client.getElasticsearchNode(replacement.ec2Instance);
    requireSafe(actualReplacement?.nodeId === replacement.nodeId, 'replacement node ID/IP drift');
    if (!target.isMasterEligible) return;

    requireSafe(state.metadata === undefined || record(state.metadata), 'invalid cluster metadata');
    if (state.metadata && 'cluster_coordination' in state.metadata) {
        const coordination = state.metadata.cluster_coordination;
        requireSafe(record(coordination), 'invalid coordination metadata');
        for (const name of ['last_committed_config', 'last_accepted_config']) {
            const config = coordination[name];
            requireSafe(
                Array.isArray(config) &&
                    config.length > 0 &&
                    config.every(id => typeof id === 'string' && !!id.trim()) &&
                    new Set(config).size === config.length,
                `invalid ${name}`
            );
            const remaining = config.filter(id => id !== target.nodeId && live.includes(id)).length;
            requireSafe(
                remaining >= Math.floor(config.length / 2) + 1,
                `no remaining quorum in ${name}`
            );
        }
        return;
    }

    const nodes = await client.execute('/_nodes?flat_settings=true');
    requireSafe(
        record(nodes?.nodes) &&
            Object.keys(nodes.nodes).length === live.length &&
            live.every(id => Object.prototype.hasOwnProperty.call(nodes.nodes, id)),
        'legacy node inventory drift'
    );
    const eligible = live.filter(id => masterEligible(nodes.nodes[id]));
    requireSafe(!targetPresent || eligible.includes(target.nodeId), 'target master eligibility drift');
    const remaining = eligible.filter(id => id !== target.nodeId).length;

    const settings = await client.execute('/_cluster/settings?include_defaults=true&flat_settings=true');
    requireSafe(
        record(settings) &&
            ['transient', 'persistent', 'defaults'].every(key => record(settings[key])),
        'invalid legacy cluster settings'
    );
    const key = 'discovery.zen.minimum_master_nodes';
    const value = settings.transient[key] ?? settings.persistent[key] ?? settings.defaults[key];
    requireSafe(
        (typeof value === 'number' || (typeof value === 'string' && /^[1-9]\d*$/.test(value))) &&
            Number.isSafeInteger(Number(value)) &&
            Number(value) > 0,
        'unknown or invalid minimum_master_nodes'
    );
    const minimum = Number(value);
    requireSafe(
        minimum >= Math.floor(remaining / 2) + 1 && minimum <= remaining,
        'unsafe legacy master quorum'
    );
}
