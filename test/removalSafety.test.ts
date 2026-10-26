import { Elasticsearch } from '../src/elasticsearch/elasticsearch';
import { assertSafeToRemove } from '../src/elasticsearch/removalSafety';
import { Instance } from '../src/aws/types';
import { TargetAndNewNodeResponse } from '../src/utils/handlerInputs';

const statePath =
    '/_cluster/state/nodes,metadata,master_node?filter_path=nodes,master_node,metadata.cluster_coordination';
const nodesPath = '/_nodes?flat_settings=true';
const settingsPath = '/_cluster/settings?include_defaults=true&flat_settings=true';
const minimumKey = 'discovery.zen.minimum_master_nodes';

function fixture(master = false, legacy = false, absent = false) {
    const sourceAsg = {
        name: 'source',
        arn: 'arn:source',
        desiredCapacity: 3,
        instanceIds: ['i-target', 'i-peer-a', 'i-peer-b'],
    };
    const event: TargetAndNewNodeResponse = {
        destinationAsgName: 'source',
        targetElasticSearchNode: {
            ec2Instance: new Instance('i-target', new Date('2025-01-01'), '10.0.0.1', 'source'),
            nodeId: 'target',
            isMasterEligible: master,
        },
        newestElasticsearchNode: {
            ec2Instance: new Instance('i-replacement', new Date('2025-01-02'), '10.0.0.2', 'source'),
            nodeId: 'replacement',
            isMasterEligible: false,
        },
        rotationPlan: {
            version: 1,
            sourceAsg,
            destinationAsg: sourceAsg,
            expectedClusterSize: 4,
            clusterSettings: {
                rebalanceEnable: null,
                allocationExcludeIp: null,
                persistentAllocationExcludeIp: null,
            },
        },
    };
    const voters = ['target', 'peer-a', 'peer-b'];
    const coordination: any = {
        last_committed_config: [...voters],
        last_accepted_config: [...voters],
    };
    const state: any = {
        nodes: Object.fromEntries(
            ['replacement', 'peer-a', 'peer-b', ...(absent ? [] : ['target'])].map(id => [id, {}])
        ),
        master_node: 'peer-a',
        metadata: legacy ? {} : { cluster_coordination: coordination },
    };
    const nodes: any = {
        nodes: Object.fromEntries(Object.keys(state.nodes).map(id => [
            id,
            {
                roles: id === 'replacement' || (id === 'target' && !master)
                    ? ['data']
                    : ['master'],
            },
        ])),
    };
    const settings: any = {
        transient: {},
        persistent: {},
        defaults: { [minimumKey]: '2' },
    };
    const health: any = {
        status: 'green',
        relocating_shards: 0,
        number_of_nodes: absent ? 3 : 4,
    };
    const mocks = {
        assertMigrationSettings: jest.fn().mockResolvedValue(undefined),
        getClusterHealth: jest.fn().mockImplementation(async () => health),
        getAllocatedShardCount: jest.fn().mockResolvedValue(0),
        getDocuments: jest.fn().mockResolvedValue({ count: 0 }),
        getElasticsearchNode: jest.fn().mockResolvedValue(event.newestElasticsearchNode),
        execute: jest.fn().mockImplementation(async (path: string) => {
            if (path === statePath) return state;
            if (path === nodesPath) return nodes;
            if (path === settingsPath) return settings;
            throw new Error(`Unexpected path: ${path}`);
        }),
    };
    const client = mocks as unknown as Elasticsearch;
    return { event, client, mocks, state, coordination, nodes, settings, health };
}

type Fixture = ReturnType<typeof fixture>;

it.each([
    ['nonmaster', false, false],
    ['modern master', true, false],
    ['legacy master', true, true],
] as const)('accepts safe %s removal using fresh checks', async (_name, master, legacy) => {
    const f = fixture(master, legacy);
    await expect(assertSafeToRemove(f.client, f.event, false)).resolves.toBeUndefined();
    expect(f.mocks.assertMigrationSettings).toHaveBeenCalledWith(
        f.event.rotationPlan.clusterSettings,
        '10.0.0.1'
    );
    expect(f.mocks.getClusterHealth).toHaveBeenCalledTimes(1);
    expect(f.mocks.getAllocatedShardCount).toHaveBeenCalledWith(f.event.targetElasticSearchNode);
    expect(f.mocks.getElasticsearchNode).toHaveBeenCalledWith(
        f.event.newestElasticsearchNode.ec2Instance
    );
    expect(f.mocks.getDocuments).not.toHaveBeenCalled();
    expect(f.mocks.execute.mock.calls.map(call => call[0])).toEqual(
        legacy ? [statePath, nodesPath, settingsPath] : [statePath]
    );
});

it.each([false, true])('allows already-stopped master replay (legacy=%s)', async legacy => {
    const f = fixture(true, legacy, true);
    await expect(assertSafeToRemove(f.client, f.event, true)).resolves.toBeUndefined();
    await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(/target node is absent/);
});

it('allows already-stopped nonmaster replay', async () => {
    const f = fixture(false, false, true);
    await expect(assertSafeToRemove(f.client, f.event, true)).resolves.toBeUndefined();
});

const driftCases: Array<[string, (f: Fixture) => void, RegExp]> = [
    [
        'yellow health',
        f => {
            f.health.status = 'yellow';
        },
        /green/,
    ],
    [
        'relocating shards',
        f => {
            f.health.relocating_shards = 1;
        },
        /relocating/,
    ],
    [
        'missing relocation count',
        f => {
            delete f.health.relocating_shards;
        },
        /relocating/,
    ],
    [
        'health count drift',
        f => {
            f.health.number_of_nodes = 3;
        },
        /size drift/,
    ],
    [
        'inventory count drift',
        f => {
            f.state.nodes.extra = {};
        },
        /size drift/,
    ],
    [
        'no master',
        f => {
            delete f.state.master_node;
        },
        /active master/,
    ],
    [
        'absent master',
        f => {
            f.state.master_node = 'missing';
        },
        /active master/,
    ],
    [
        'missing nodes',
        f => {
            delete f.state.nodes;
        },
        /cluster nodes/,
    ],
    [
        'replacement absent',
        f => {
            delete f.state.nodes.replacement;
        },
        /replacement node is absent/,
    ],
    [
        'replacement ID/IP drift',
        f => {
            f.mocks.getElasticsearchNode.mockResolvedValue({ nodeId: 'other' });
        },
        /ID\/IP drift/,
    ],
    [
        'same node ID',
        f => {
            f.event.newestElasticsearchNode.nodeId = 'target';
        },
        /distinct node IDs/,
    ],
    [
        'empty node ID',
        f => {
            f.event.newestElasticsearchNode.nodeId = '';
        },
        /distinct node IDs/,
    ],
    [
        'empty shard with zero documents',
        f => {
            f.mocks.getAllocatedShardCount.mockResolvedValue(1);
        },
        /allocated shards/,
    ],
    [
        'unknown shard count',
        f => {
            f.mocks.getAllocatedShardCount.mockResolvedValue(undefined);
        },
        /allocated shards/,
    ],
];
it.each(driftCases)('rejects %s', async (_name, change, error) => {
    const f = fixture();
    change(f);
    await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(error);
    expect(f.mocks.getDocuments).not.toHaveBeenCalled();
});

it.each(['plan', 'settings'] as const)(
    'requires saved %s before contacting Elasticsearch',
    async missing => {
        const f = fixture();
        if (missing === 'plan') delete f.event.rotationPlan;
        else delete f.event.rotationPlan.clusterSettings;
        await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(
            /rotation plan|settings baseline/
        );
        expect(f.mocks.assertMigrationSettings).not.toHaveBeenCalled();
    }
);

it('propagates migration-settings drift before other checks', async () => {
    const f = fixture();
    f.mocks.assertMigrationSettings.mockRejectedValue(new Error('allocation exclusion changed'));
    await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(
        /allocation exclusion changed/
    );
    expect(f.mocks.getClusterHealth).not.toHaveBeenCalled();
});

it.each(['last_committed_config', 'last_accepted_config'])(
    'requires remaining live majority independently in %s',
    async key => {
        const f = fixture(true);
        f.coordination[key] = ['target', 'peer-a', 'offline'];
        await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(
            new RegExp(`quorum in ${key}`)
        );
    }
);

it.each(['last_committed_config', 'last_accepted_config'])(
    'rejects malformed %s without legacy fallback',
    async key => {
        for (const value of [
            undefined,
            null,
            [],
            'peer-a',
            ['peer-a', 'peer-a'],
            ['peer-a', 1],
            [' '],
        ]) {
            const f = fixture(true);
            f.coordination[key] = value;
            await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(
                new RegExp(`invalid ${key}`)
            );
            expect(f.mocks.execute).toHaveBeenCalledTimes(1);
        }
    }
);

it.each([null, [], 'invalid'])('rejects malformed modern metadata %p', async value => {
    const f = fixture(true);
    f.state.metadata.cluster_coordination = value;
    await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(/coordination metadata/);
});

it('does not count a stopped target as a remaining modern voter', async () => {
    const f = fixture(true, false, true);
    f.coordination.last_accepted_config = ['target', 'peer-a'];
    await expect(assertSafeToRemove(f.client, f.event, true)).rejects.toThrow(/quorum/);
});

it.each([
    { roles: ['master'] },
    { settings: { 'node.master': 'true' } },
    { settings: {} },
])('recognizes legacy eligible node %p', async node => {
    const f = fixture(true, true);
    f.nodes.nodes['peer-a'] = node;
    await expect(assertSafeToRemove(f.client, f.event, false)).resolves.toBeUndefined();
});

it.each([
    { roles: [], settings: { 'node.master': true } },
    { settings: { 'node.master': 'false' } },
])('excludes legacy ineligible node %p', async node => {
    const f = fixture(true, true);
    f.nodes.nodes['peer-a'] = node;
    await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(/legacy master quorum/);
});

it.each([
    {},
    { roles: 'master' },
    { settings: { 'node.master': 'unknown' } },
])('fails closed on unknown legacy node %p', async node => {
    const f = fixture(true, true);
    f.nodes.nodes['peer-a'] = node;
    await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(
        /legacy node|node roles|node.master/
    );
});

it.each(['transient', 'persistent', 'defaults'])('resolves legacy minimum from %s', async layer => {
    const f = fixture(true, true);
    f.settings.defaults[minimumKey] = '1';
    f.settings[layer][minimumKey] = 2;
    await expect(assertSafeToRemove(f.client, f.event, false)).resolves.toBeUndefined();
});

it.each([undefined, 'invalid', 1, 3])(
    'rejects unknown, malformed or unsafe legacy minimum %p',
    async value => {
        const f = fixture(true, true);
        f.settings.defaults[minimumKey] = value;
        await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(
            /minimum_master_nodes|legacy master quorum/
        );
    }
);

it('does not fall back from malformed higher-precedence minimum', async () => {
    const f = fixture(true, true);
    f.settings.transient[minimumKey] = 'bad';
    await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(/minimum_master_nodes/);
});

it.each([false, true])(
    'accepts a like-for-like legacy master replacement (target absent=%s)',
    async absent => {
        const f = fixture(true, true, absent);
        f.nodes.nodes.replacement.roles = ['master'];
        f.settings.defaults[minimumKey] = '2';
        await expect(assertSafeToRemove(f.client, f.event, absent)).resolves.toBeUndefined();
    }
);

it('rejects legacy node inventory drift', async () => {
    const f = fixture(true, true);
    delete f.nodes.nodes['peer-a'];
    f.nodes.nodes.other = { roles: ['master'] };
    await expect(assertSafeToRemove(f.client, f.event, false)).rejects.toThrow(/inventory drift/);
});

it('still checks the full expected count when replay target remains present', async () => {
    const f = fixture();
    f.health.number_of_nodes--;
    await expect(assertSafeToRemove(f.client, f.event, true)).rejects.toThrow(/size drift/);
});
