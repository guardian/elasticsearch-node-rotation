import {
    AttachInstancesCommand,
    AutoScalingGroup,
    DescribeAutoScalingGroupsCommand,
    DescribeAutoScalingInstancesCommand,
    DetachInstancesCommand,
    SetDesiredCapacityCommand,
} from '@aws-sdk/client-auto-scaling';
import { attachInstance, launchNewInstance } from '../src/aws/autoscaling';
import { getInstanceState } from '../src/aws/ec2Instances';
import { Instance } from '../src/aws/types';
import type { RotationPlan } from '../src/utils/handlerInputs';

type Mutation = AttachInstancesCommand | DetachInstancesCommand | SetDesiredCapacityCommand;
type Command = Mutation | DescribeAutoScalingGroupsCommand | DescribeAutoScalingInstancesCommand;
type Member = NonNullable<AutoScalingGroup['Instances']>[number];
type TestGroup = AutoScalingGroup & { Instances: Member[]; DesiredCapacity: number };

jest.mock('@aws-sdk/client-auto-scaling', () => ({
    ...jest.requireActual('@aws-sdk/client-auto-scaling'),
    AutoScaling: jest.fn().mockImplementation((config) => ({
        send: (command: Command) => mockSend(command, config),
    })),
}));
jest.mock('../src/aws/ec2Instances');
jest.mock('../src/utils/helperFunctions', () => ({
    // Preserve bounded retries without the real 15-second delay.
    retry: async (fn: () => Promise<unknown>, _task: string, remainingRetries: number) => {
        for (let attempt = 0; ; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === remainingRetries) throw error;
            }
        }
    },
}));

const mockSend = jest.fn();
const ec2State = getInstanceState as jest.MockedFunction<typeof getInstanceState>;
const target = new Instance('i-target', new Date('2025-01-01'), '10.0.0.1', 'source');
let groups: Record<string, TestGroup>;
let membership:
    | {
          InstanceId: string;
          AutoScalingGroupName: string;
          LifecycleState: string;
      }
    | undefined;
let mutations: Mutation[];
let observations: number;
let onObserve: ((round: number) => void) | undefined;
let afterMutation: (() => void) | undefined;
let lostResponse: string | undefined;

function plan(crossAsg = false): RotationPlan {
    const source = {
        name: 'source',
        arn: 'arn:source',
        desiredCapacity: 2,
        instanceIds: [target.id, 'i-peer'],
    };
    return {
        version: 1,
        sourceAsg: source,
        destinationAsg: crossAsg
            ? {
                  name: 'destination',
                  arn: 'arn:destination',
                  desiredCapacity: 2,
                  instanceIds: ['i-dest-1', 'i-dest-2'],
              }
            : { ...source, instanceIds: [...source.instanceIds] },
        expectedClusterSize: crossAsg ? 4 : 2,
    };
}

function member(id: string, lifecycle: Member['LifecycleState'] = 'InService'): Member {
    return {
        InstanceId: id,
        LifecycleState: lifecycle,
        HealthStatus: 'Healthy',
        AvailabilityZone: 'eu-west-1a',
        ProtectedFromScaleIn: false,
    };
}

function detached() {
    groups.source.Instances = [member('i-peer'), member('i-replacement')];
    membership = undefined;
}

function attached(lifecycle: Member['LifecycleState'] = 'InService') {
    detached();
    groups.source.Instances.push(member(target.id, lifecycle));
    groups.source.DesiredCapacity = 3;
    membership = {
        InstanceId: target.id,
        AutoScalingGroupName: 'source',
        LifecycleState: lifecycle,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    mutations = [];
    observations = 0;
    onObserve = afterMutation = lostResponse = undefined;
    const saved = plan(true);
    groups = Object.fromEntries(
        [saved.sourceAsg, saved.destinationAsg].map((snapshot) => [
            snapshot.name,
            {
                AutoScalingGroupName: snapshot.name,
                AutoScalingGroupARN: snapshot.arn,
                DesiredCapacity: snapshot.desiredCapacity,
                Instances: snapshot.instanceIds.map((id) => member(id)),
            },
        ])
    ) as Record<string, TestGroup>;
    membership = {
        InstanceId: target.id,
        AutoScalingGroupName: 'source',
        LifecycleState: 'InService',
    };
    ec2State.mockResolvedValue('running');
    mockSend.mockImplementation(async (command: Command, config) => {
        if (command instanceof DescribeAutoScalingGroupsCommand) {
            const name = command.input.AutoScalingGroupNames![0];
            if (name === 'source') {
                observations++;
                onObserve?.(observations);
            }
            return { AutoScalingGroups: groups[name] ? [structuredClone(groups[name])] : [] };
        }
        if (command instanceof DescribeAutoScalingInstancesCommand) {
            expect(command.input.InstanceIds).toEqual([target.id]);
            return { AutoScalingInstances: membership ? [{ ...membership }] : [] };
        }
        expect(config).toEqual({ maxAttempts: 1 });
        mutations.push(command);
        if (command instanceof DetachInstancesCommand) detached();
        else if (command instanceof SetDesiredCapacityCommand) {
            const group = groups[command.input.AutoScalingGroupName!];
            group.DesiredCapacity = command.input.DesiredCapacity!;
        } else attached();
        afterMutation?.();
        // Model AWS accepting the write before the caller loses its response.
        if (command.constructor.name === lostResponse) {
            throw new Error('accepted, but response lost');
        }
        return {};
    });
});

describe('planned AWS reconciliation', () => {
    it('replays accepted detach without decrementing capacity or resubmitting', async () => {
        lostResponse = 'DetachInstancesCommand';
        await expect(launchNewInstance(target, 'source', plan())).rejects.toThrow('response lost');
        await launchNewInstance(target, 'source', plan());
        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(DetachInstancesCommand);
        expect(mutations[0].input).toEqual({
            InstanceIds: [target.id],
            AutoScalingGroupName: 'source',
            ShouldDecrementDesiredCapacity: false,
        });
        expect(groups.source.DesiredCapacity).toBe(2);
    });

    it.each([0, 4])('replays saved capacity %s + 1 after a lost response', async (baseline) => {
        const saved = plan(true);
        saved.destinationAsg.desiredCapacity = baseline;
        saved.destinationAsg.instanceIds = Array.from(
            { length: baseline },
            (_, i) => `i-dest-${i}`
        );
        groups.destination.DesiredCapacity = baseline;
        groups.destination.Instances = saved.destinationAsg.instanceIds.map((id) => member(id));
        lostResponse = 'SetDesiredCapacityCommand';
        await expect(launchNewInstance(target, 'destination', saved)).rejects.toThrow(
            'response lost'
        );
        await launchNewInstance(target, 'destination', saved);
        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(SetDesiredCapacityCommand);
        expect(mutations[0].input).toEqual({
            AutoScalingGroupName: 'destination',
            DesiredCapacity: baseline + 1,
        });
        expect(groups.source.DesiredCapacity).toBe(2);
    });

    it('attaches an untagged target and replays a lost response without resubmission', async () => {
        detached();
        lostResponse = 'AttachInstancesCommand';
        await expect(attachInstance(target, 'source', plan(), 'i-replacement')).rejects.toThrow(
            'response lost'
        );
        await attachInstance(target, 'source', plan(), 'i-replacement');
        expect(mutations).toHaveLength(1);
        expect(mutations[0]).toBeInstanceOf(AttachInstancesCommand);
        expect(mutations[0].input).toEqual({
            InstanceIds: [target.id],
            AutoScalingGroupName: 'source',
        });
        expect(groups.source.DesiredCapacity).toBe(3);
    });

    it('returns promptly during draining despite lagging membership', async () => {
        afterMutation = () => {
            groups.source.Instances = [member(target.id, 'Detaching'), member('i-peer')];
            membership = {
                InstanceId: target.id,
                AutoScalingGroupName: 'source',
                LifecycleState: 'Detaching',
            };
        };
        await launchNewInstance(target, 'source', plan());
        expect(observations).toBe(1);
        groups.source.Instances[0].LifecycleState = 'InService'; // lagging group view
        await launchNewInstance(target, 'source', plan());
        detached();
        await launchNewInstance(target, 'source', plan());
        expect(mutations).toHaveLength(1);
    });

    it('returns before capacity reads catch up and accepts capacity without a new member', async () => {
        afterMutation = () => {
            groups.destination.DesiredCapacity = 2;
        };
        await launchNewInstance(target, 'destination', plan(true));
        expect(observations).toBe(1);
        expect(groups.destination.DesiredCapacity).toBe(2);
        groups.destination.DesiredCapacity = 3;
        await launchNewInstance(target, 'destination', plan(true));
        expect(mutations).toHaveLength(1);
    });

    it('polls an accepted attach without resubmitting on stale pre-attach reads', async () => {
        detached();
        afterMutation = () => attached('Pending');
        onObserve = (round) => {
            if (round === 2) {
                detached();
                groups.source.DesiredCapacity = 2;
            } else if (round === 3) attached();
        };
        await attachInstance(target, 'source', plan(), 'i-replacement');
        expect(mutations).toHaveLength(1);
    });

    it('uses bounded read-only polling when attach capacity precedes membership', async () => {
        detached();
        groups.source.DesiredCapacity = 3;
        await expect(attachInstance(target, 'source', plan(), 'i-replacement')).rejects.toThrow(
            'no mutation will be resubmitted'
        );
        expect(mutations).toHaveLength(0);
    });

    it('retries an EC2 read failure without retrying the mutation', async () => {
        ec2State.mockRejectedValueOnce(new Error('EC2 temporarily unavailable'));
        await launchNewInstance(target, 'source', plan());
        expect(ec2State).toHaveBeenCalledTimes(2);
        expect(mutations).toHaveLength(1);
    });
});

describe('fail-closed conflicts', () => {
    it.each(['source', 'destination'])('rejects recreated %s ASG identity', async (name) => {
        groups[name].AutoScalingGroupARN = 'arn:recreated';
        await expect(launchNewInstance(target, 'destination', plan(true))).rejects.toThrow(
            'ARN drift'
        );
        expect(mutations).toHaveLength(0);
    });

    it.each([
        [
            'capacity',
            () => {
                groups.source.DesiredCapacity = 3;
            },
            'desired capacity',
        ],
        [
            'membership',
            () => {
                groups.source.Instances[1] = member('i-other');
            },
            'membership drift',
        ],
        [
            'lifecycle',
            () => {
                groups.source.Instances[0] = member(target.id, 'Standby');
            },
            'lifecycle',
        ],
        [
            'wrong ASG',
            () => {
                membership!.AutoScalingGroupName = 'other';
            },
            'wrong ASG membership',
        ],
    ] as [string, () => void, string][])('rejects detach %s drift', async (_, change, error) => {
        change();
        await expect(launchNewInstance(target, 'source', plan())).rejects.toThrow(error);
        expect(mutations).toHaveLength(0);
    });

    it.each([
        [
            'capacity',
            () => {
                groups.destination.DesiredCapacity = 4;
            },
            'desired capacity',
        ],
        ['source membership', detached, 'membership drift'],
        [
            'new member',
            () => groups.destination.Instances.push(member('i-new')),
            'membership drift',
        ],
    ] as [string, () => void, string][])('rejects cross-ASG %s drift', async (_, change, error) => {
        change();
        await expect(launchNewInstance(target, 'destination', plan(true))).rejects.toThrow(error);
        expect(mutations).toHaveLength(0);
    });

    it('rejects drift on a later invocation after an accepted detach', async () => {
        await launchNewInstance(target, 'source', plan());
        groups.source.DesiredCapacity = 3;
        await expect(launchNewInstance(target, 'source', plan())).rejects.toThrow(
            'desired capacity'
        );
        expect(mutations).toHaveLength(1);
    });

    it.each([
        [
            'capacity',
            () => {
                groups.source.DesiredCapacity = 4;
            },
            'desired capacity',
        ],
        [
            'replacement lifecycle',
            () => {
                groups.source.Instances[1].LifecycleState = 'Pending';
            },
            'InService replacement',
        ],
        [
            'replacement health',
            () => {
                groups.source.Instances[1].HealthStatus = 'Unhealthy';
            },
            'Healthy replacement',
        ],
        [
            'replacement identity',
            () => {
                groups.source.Instances[1].InstanceId = 'i-other';
            },
            'identity drift',
        ],
        ['target lifecycle', () => attached('Detaching'), 'Unexpected attach lifecycle'],
    ] as [string, () => void, string][])('rejects attach %s conflict', async (_, change, error) => {
        detached();
        change();
        await expect(attachInstance(target, 'source', plan(), 'i-replacement')).rejects.toThrow(
            error
        );
        expect(mutations).toHaveLength(0);
    });

    it.each(['health', 'identity'])('rechecks replacement %s after attach', async (field) => {
        detached();
        afterMutation = () => {
            const replacement = groups.source.Instances[1];
            if (field === 'health') replacement.HealthStatus = 'Unhealthy';
            else replacement.InstanceId = 'i-other';
        };
        await expect(attachInstance(target, 'source', plan(), 'i-replacement')).rejects.toThrow(
            /Healthy replacement|identity drift/
        );
        expect(mutations).toHaveLength(1);
    });

    it('checks ARN even when the target is already attached', async () => {
        attached();
        groups.source.AutoScalingGroupARN = 'arn:recreated';
        await expect(attachInstance(target, 'source', plan(), 'i-replacement')).rejects.toThrow(
            'ARN drift'
        );
        expect(mutations).toHaveLength(0);
    });

    it('rejects a non-running target for both operations', async () => {
        ec2State.mockResolvedValue('stopped');
        await expect(launchNewInstance(target, 'source', plan())).rejects.toThrow('not running');
        detached();
        await expect(attachInstance(target, 'source', plan(), 'i-replacement')).rejects.toThrow(
            'not running'
        );
        expect(mutations).toHaveLength(0);
    });

    it('never reattaches across ASGs', async () => {
        await expect(
            attachInstance(target, 'destination', plan(true), 'i-replacement')
        ).rejects.toThrow('same-ASG');
        expect(mockSend).not.toHaveBeenCalled();
    });
});
