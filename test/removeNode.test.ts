import {handler} from '../src/removeNode';
import {enterStandby, getASG, terminateInstanceInASG} from '../src/aws/autoscaling';
import {Elasticsearch} from '../src/elasticsearch/elasticsearch';
import {ssmCommand} from '../src/utils/ssmCommand';
import {Instance} from '../src/aws/types';
import {TargetAndNewNodeResponse} from '../src/utils/handlerInputs';
import {AutoScalingGroup} from '@aws-sdk/client-auto-scaling';

jest.mock('../src/aws/autoscaling');
jest.mock('../src/elasticsearch/elasticsearch');
jest.mock('../src/utils/ssmCommand');

const mockedEnterStandby = enterStandby as jest.MockedFunction<typeof enterStandby>;
const mockedGetASG = getASG as jest.MockedFunction<typeof getASG>;
const mockedTerminateInstanceInASG = terminateInstanceInASG as jest.MockedFunction<typeof terminateInstanceInASG>;
const mockedSsmCommand = ssmCommand as jest.MockedFunction<typeof ssmCommand>;

function buildEvent(): TargetAndNewNodeResponse {
    const targetInstance = new Instance('i-target', new Date('2025-01-01T00:00:00.000Z'), '10.0.0.1', 'asg');
    const newestInstance = new Instance('i-newest', new Date('2025-01-02T00:00:00.000Z'), '10.0.0.2', 'asg');

    return {
        destinationAsgName: 'asg',
        targetElasticSearchNode: {
            ec2Instance: targetInstance,
            nodeId: 'node-target',
            isMasterEligible: false,
        },
        newestElasticsearchNode: {
            ec2Instance: newestInstance,
            nodeId: 'node-newest',
            isMasterEligible: false,
        },
    };
}

describe('removeNode handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedEnterStandby.mockResolvedValue(undefined);
    });

    it('puts master-eligible node into standby before stopping elasticsearch and terminating', async () => {
        const event = buildEvent();
        event.targetElasticSearchNode.isMasterEligible = true;
        const callOrder: string[] = [];

        mockedEnterStandby.mockImplementation(async () => {
            callOrder.push('enterStandby');
        });
        mockedSsmCommand.mockImplementation(async () => {
            callOrder.push('ssmCommand');
            return '';
        });
        mockedTerminateInstanceInASG.mockImplementation(async () => {
            callOrder.push('terminateInstanceInASG');
            return {} as any;
        });
        mockedGetASG.mockResolvedValue({
            AutoScalingGroupName: 'asg',
            Instances: [
                { InstanceId: 'i-newest', LifecycleState: 'InService' },
            ],
        } as AutoScalingGroup);
        (Elasticsearch as jest.MockedClass<typeof Elasticsearch>).mockImplementation(() => ({
            excludeFromAllocation: () => Promise.resolve(true),
        } as any));

        await expect(handler(event)).resolves.toEqual(event);
        expect(mockedEnterStandby).toHaveBeenCalledWith(event.targetElasticSearchNode.ec2Instance);
        expect(mockedSsmCommand).toHaveBeenCalledWith('systemctl stop elasticsearch', 'i-target', false);
        expect(mockedTerminateInstanceInASG).toHaveBeenCalledWith(event.targetElasticSearchNode.ec2Instance);
        expect(callOrder).toEqual(['enterStandby', 'ssmCommand', 'terminateInstanceInASG']);
    });

    it('falls back to other instances to clear allocation exclusion', async () => {
        const event = buildEvent();
        const excludeCallOrder: string[] = [];

        mockedTerminateInstanceInASG.mockResolvedValue({} as any);
        mockedGetASG.mockResolvedValue({
            AutoScalingGroupName: 'asg',
            Instances: [
                { InstanceId: 'i-fallback', LifecycleState: 'InService' },
            ],
        } as AutoScalingGroup);

        (Elasticsearch as jest.MockedClass<typeof Elasticsearch>).mockImplementation((instanceId: string) => {
            return {
                excludeFromAllocation: () => {
                    excludeCallOrder.push(instanceId);
                    if (instanceId === 'i-fallback') {
                        return Promise.resolve(true);
                    }
                    return Promise.reject(new Error('ssm-unavailable'));
                },
            } as any;
        });

        await expect(handler(event)).resolves.toEqual(event);
        expect(mockedTerminateInstanceInASG).toHaveBeenCalledWith(event.targetElasticSearchNode.ec2Instance);
        expect(excludeCallOrder).toEqual(['i-newest', 'i-target', 'i-fallback']);
    });

    it('fails rotation if allocation exclusion cannot be cleared', async () => {
        const event = buildEvent();
        const excludeCallOrder: string[] = [];

        mockedTerminateInstanceInASG.mockResolvedValue({} as any);
        mockedGetASG.mockResolvedValue({
            AutoScalingGroupName: 'asg',
            Instances: [
                { InstanceId: 'i-fallback', LifecycleState: 'InService' },
            ],
        } as AutoScalingGroup);

        (Elasticsearch as jest.MockedClass<typeof Elasticsearch>).mockImplementation((instanceId: string) => {
            return {
                excludeFromAllocation: () => {
                    excludeCallOrder.push(instanceId);
                    return Promise.reject(new Error('ssm-unavailable'));
                },
            } as any;
        });

        await expect(handler(event)).rejects.toThrow('Failed to clear allocation exclusion via any instance');
        expect(mockedTerminateInstanceInASG).toHaveBeenCalledWith(event.targetElasticSearchNode.ec2Instance);
        expect(excludeCallOrder).toEqual(['i-newest', 'i-target', 'i-fallback']);
    });
});
