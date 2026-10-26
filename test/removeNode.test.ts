import { handler } from '../src/removeNode';
import { handler as cleanup } from '../src/restoreClusterSettings';
import {
    getASG,
    getRemovalState,
    reconcileStandby,
    reconcileTermination,
    RemovalState,
} from '../src/aws/autoscaling';
import { Elasticsearch } from '../src/elasticsearch/elasticsearch';
import { assertSafeToRemove } from '../src/elasticsearch/removalSafety';
import { ssmCommand } from '../src/utils/ssmCommand';
import { Instance } from '../src/aws/types';
import { TargetAndNewNodeResponse } from '../src/utils/handlerInputs';

jest.mock('../src/aws/autoscaling');
jest.mock('../src/elasticsearch/elasticsearch');
jest.mock('../src/elasticsearch/removalSafety');
jest.mock('../src/utils/ssmCommand');

const observe = getRemovalState as jest.MockedFunction<typeof getRemovalState>;
const standby = reconcileStandby as jest.MockedFunction<typeof reconcileStandby>;
const terminate = reconcileTermination as jest.MockedFunction<typeof reconcileTermination>;
const safety = assertSafeToRemove as jest.MockedFunction<typeof assertSafeToRemove>;
const settings = jest.fn();
const restore = jest.fn();
let event: TargetAndNewNodeResponse;

beforeEach(() => {
    jest.resetAllMocks();
    const snapshot = {
        name: 'asg',
        arn: 'arn:asg',
        desiredCapacity: 2,
        instanceIds: ['i-target', 'i-peer'],
    };
    event = {
        destinationAsgName: 'asg',
        targetElasticSearchNode: {
            ec2Instance: new Instance('i-target', new Date('2025-01-01'), '10.0.0.1', 'asg'),
            nodeId: 'target-node',
            isMasterEligible: true,
        },
        newestElasticsearchNode: {
            ec2Instance: new Instance('i-new', new Date('2025-01-02'), '10.0.0.2', 'asg'),
            nodeId: 'new-node',
            isMasterEligible: true,
        },
        rotationPlan: {
            version: 1,
            sourceAsg: snapshot,
            destinationAsg: snapshot,
            expectedClusterSize: 3,
            clusterSettings: {
                rebalanceEnable: null,
                allocationExcludeIp: null,
                persistentAllocationExcludeIp: null,
            },
        },
    };
    observe.mockResolvedValue('InService');
    standby.mockResolvedValue('Standby');
    (getASG as jest.Mock).mockResolvedValue({
        Instances: [{ InstanceId: 'i-peer', LifecycleState: 'InService' }],
    });
    (Elasticsearch as jest.Mock).mockImplementation(() => ({
        getClusterSettings: settings,
        restoreClusterSettings: restore,
    }));
});

it(
    'rechecks safety around standby, then shuts down, confirms termination and restores settings',
    async () => {
        const order: string[] = [];
        safety.mockImplementation(async (_client, _event, allowAbsent) => {
            order.push(`safety:${allowAbsent}`);
        });
        standby.mockImplementation(async () => {
            order.push('standby');
            return 'Standby';
        });
        (ssmCommand as jest.Mock).mockImplementation(async () => {
            order.push('shutdown');
        });
        terminate.mockImplementation(async () => {
            order.push('terminated');
        });
        restore.mockImplementation(async () => {
            order.push('restore');
        });
        await expect(handler(event)).resolves.toBe(event);
        expect(restore).not.toHaveBeenCalled();
        await expect(cleanup(event)).resolves.toBe(event);
        expect(order).toEqual([
            'safety:false',
            'standby',
            'safety:true',
            'shutdown',
            'terminated',
            'restore',
        ]);
        expect(restore).toHaveBeenCalledWith(event.rotationPlan!.clusterSettings, '10.0.0.1');
        expect(terminate).toHaveBeenCalledWith(
            event.targetElasticSearchNode.ec2Instance,
            event.rotationPlan,
            'i-new'
        );
    }
);

it.each(['EnteringStandby', 'Standby', 'Terminating', 'Terminated'] as RemovalState[])(
    'resumes from %s without repeating earlier operations',
    async (state) => {
        observe.mockResolvedValue(state);
        await handler(event);
        expect(standby).toHaveBeenCalledTimes(state === 'EnteringStandby' ? 1 : 0);
        expect(safety).toHaveBeenCalledTimes(['EnteringStandby', 'Standby'].includes(state) ? 1 : 0);
        expect(ssmCommand).toHaveBeenCalledTimes(['EnteringStandby', 'Standby'].includes(state) ? 1 : 0);
        expect(terminate).toHaveBeenCalledTimes(state === 'Terminated' ? 0 : 1);
        expect(restore).not.toHaveBeenCalled();
    }
);

it.each(['plan', 'settings'])('fails closed before side effects without a saved %s', async (missing) => {
    if (missing === 'plan') {
        delete event.rotationPlan;
    } else {
        delete event.rotationPlan!.clusterSettings;
    }
    await expect(handler(event)).rejects.toThrow(/Missing or invalid/);
    expect(observe).not.toHaveBeenCalled();
    expect(Elasticsearch).not.toHaveBeenCalled();
});

it('does not shut down or terminate when fresh removal safety fails', async () => {
    observe.mockResolvedValue('Standby');
    safety.mockRejectedValue(new Error('target still has shards'));
    await expect(handler(event)).rejects.toThrow('still has shards');
    expect(ssmCommand).not.toHaveBeenCalled();
    expect(terminate).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
});

it('does not clear exclusions when standby or termination fails or times out', async () => {
    standby.mockRejectedValueOnce(new Error('standby timeout'));
    await expect(handler(event)).rejects.toThrow('standby timeout');
    expect(restore).not.toHaveBeenCalled();
    terminate.mockRejectedValueOnce(new Error('termination not confirmed'));
    await expect(handler(event)).rejects.toThrow('termination not confirmed');
    expect(restore).not.toHaveBeenCalled();
});

it('continues after best-effort shutdown fails', async () => {
    (ssmCommand as jest.Mock).mockRejectedValue(new Error('response lost'));
    await handler(event);
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(restore).not.toHaveBeenCalled();
});

it('does not stop Elasticsearch on data-only nodes', async () => {
    event.targetElasticSearchNode.isMasterEligible = false;
    await handler(event);
    expect(ssmCommand).not.toHaveBeenCalled();
});

it('redrives cleanup after termination without touching the terminated target', async () => {
    terminate.mockImplementation(async () => {
        observe.mockResolvedValue('Terminated');
    });
    restore.mockRejectedValueOnce(new Error('SSM unavailable'));
    await handler(event);
    await expect(cleanup(event)).rejects.toThrow('SSM unavailable');
    observe.mockRejectedValue(new Error('EC2 no longer retains terminated instance'));
    await cleanup(event);
    expect(terminate).toHaveBeenCalledTimes(1);
    expect(ssmCommand).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(2);
    expect(Elasticsearch).not.toHaveBeenCalledWith('i-target');
});

it('falls back to an InService survivor when the replacement cannot be reached', async () => {
    settings.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({});
    await handler(event);
    expect(Elasticsearch).toHaveBeenNthCalledWith(1, 'i-new');
    expect(Elasticsearch).toHaveBeenNthCalledWith(2, 'i-peer');
});

it('fails without destructive actions when no survivor is reachable', async () => {
    settings.mockRejectedValue(new Error('unavailable'));
    await expect(handler(event)).rejects.toThrow('No surviving');
    expect(standby).not.toHaveBeenCalled();
    expect(terminate).not.toHaveBeenCalled();
});

it(
    'preserves an uncertain cleanup write for redrive rather than submitting through every survivor',
    async () => {
        observe.mockResolvedValue('Terminated');
        restore.mockRejectedValue(new Error('response lost'));
        await expect(cleanup(event)).rejects.toThrow('response lost');
        expect(restore).toHaveBeenCalledTimes(1);
    }
);
