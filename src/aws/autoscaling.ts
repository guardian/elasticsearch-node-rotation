import { Instance } from './types';
import { retry } from '../utils/helperFunctions';
import type { AsgSnapshot, RotationPlan } from '../utils/handlerInputs';
import { getInstanceState } from './ec2Instances';
import {
    AttachInstancesCommand,
    AutoScaling,
    AutoScalingGroup,
    DescribeAutoScalingGroupsCommand,
    DescribeAutoScalingGroupsCommandOutput,
    DetachInstancesCommand,
    DescribeAutoScalingInstancesCommand,
    EnterStandbyCommand,
    SetDesiredCapacityCommand,
    TerminateInstanceInAutoScalingGroupCommand,
} from '@aws-sdk/client-auto-scaling';

const awsAutoscaling = new AutoScaling();

// These writes must never be retried by the SDK: a lost response may hide success.

const awsAutoscalingMutations = new AutoScaling({ maxAttempts: 1 });

function checkGroup(
    group: AutoScalingGroup,
    snapshot: AsgSnapshot,
    capacities: number[],
    removedIds: string[] = [],
    maxNew = 0
): void {
    if (
        group.AutoScalingGroupName !== snapshot.name ||
        group.AutoScalingGroupARN !== snapshot.arn
    ) {
        throw new Error(`ASG identity/ARN drift for ${snapshot.name}`);
    }
    if (!capacities.includes(group.DesiredCapacity)) {
        throw new Error(
            `Unexpected desired capacity ${group.DesiredCapacity} for ${snapshot.name}`
        );
    }
    const instances = group.Instances ?? [];
    const ids = instances.map((member) => member.InstanceId);
    if (
        ids.some((id) => !id) ||
        new Set(ids).size !== ids.length ||
        snapshot.instanceIds.some((id) => !removedIds.includes(id) && !ids.includes(id)) ||
        ids.filter((id) => !snapshot.instanceIds.includes(id)).length > maxNew
    ) {
        throw new Error(`Unexpected membership drift in ${snapshot.name}`);
    }
    for (const member of instances) {
        if (removedIds.includes(member.InstanceId)) {
            continue;
        }
        const allowed = snapshot.instanceIds.includes(member.InstanceId)
            ? ['InService']
            : ['InService', 'Pending', 'Pending:Wait', 'Pending:Proceed'];
        if (!allowed.includes(member.LifecycleState)) {
            throw new Error(
                `Unexpected lifecycle ${member.LifecycleState} for ${member.InstanceId}`
            );
        }
    }
}

async function observe(instance: Instance, plan: RotationPlan) {
    const [source, destination, ec2, membershipResponse] = await Promise.all([
        getASG(plan.sourceAsg.name),
        plan.sourceAsg.name === plan.destinationAsg.name
            ? Promise.resolve(undefined)
            : getASG(plan.destinationAsg.name),
        retry(() => getInstanceState(instance.id), `reading EC2 state for ${instance.id}`, 5),
        retry(
            () =>
                awsAutoscaling.send(
                    new DescribeAutoScalingInstancesCommand({
                        InstanceIds: [instance.id],
                    })
                ),
            `reading ASG membership for ${instance.id}`,
            5
        ),
    ]);
    if (ec2 !== 'running') {
        throw new Error(`Target ${instance.id} is not running (EC2 state ${ec2})`);
    }
    const memberships = membershipResponse.AutoScalingInstances ?? [];
    if (
        memberships.length > 1 ||
        memberships.some(
            (member) =>
                member.InstanceId !== instance.id ||
                member.AutoScalingGroupName !== plan.sourceAsg.name
        )
    ) {
        throw new Error(`Target ${instance.id} has unexpected/wrong ASG membership`);
    }
    // EC2 ASG tags can lag detach/attach. Only the ASG APIs decide membership.
    return { source, destination, membership: memberships[0] };
}

type Observation = Awaited<ReturnType<typeof observe>>;
type Reconciliation = 'write' | 'wait' | 'done';

export async function launchNewInstance(
    instance: Instance,
    asgName: string,
    plan: RotationPlan
): Promise<void> {
    const sameAsg = plan.sourceAsg.name === plan.destinationAsg.name;
    const reconcile = ({ source, destination, membership }: Observation): Reconciliation => {
        if (!sameAsg) {
            checkGroup(source, plan.sourceAsg, [plan.sourceAsg.desiredCapacity]);
            const target = source.Instances?.find((member) => member.InstanceId === instance.id);
            if (
                target?.LifecycleState !== 'InService' ||
                membership?.LifecycleState !== 'InService'
            ) {
                throw new Error(`Unexpected source membership/lifecycle for ${instance.id}`);
            }
            const baseline = plan.destinationAsg.desiredCapacity;
            checkGroup(destination, plan.destinationAsg, [baseline, baseline + 1], [], 1);
            if (destination.DesiredCapacity === baseline + 1) {
                return 'done';
            }
            if (
                (destination.Instances ?? []).some(
                    (member) => !plan.destinationAsg.instanceIds.includes(member.InstanceId)
                )
            ) {
                throw new Error(`Unexpected membership drift in ${asgName} before capacity change`);
            }
            return 'write';
        }
        const baseline = plan.sourceAsg.desiredCapacity;
        checkGroup(source, plan.sourceAsg, [baseline], [instance.id], 1);
        const target = source.Instances?.find((member) => member.InstanceId === instance.id);
        const states = [target?.LifecycleState, membership?.LifecycleState].filter(
            (state) => state !== undefined
        );
        if (
            (target && !target.LifecycleState) ||
            (membership && !membership.LifecycleState) ||
            states.some((state) => !['InService', 'Detaching', 'Detached'].includes(state))
        ) {
            throw new Error(`Unexpected detach lifecycle for ${instance.id}: ${states.join(', ')}`);
        }
        if (!target && !membership) {
            return 'done';
        }
        if (target?.LifecycleState === 'InService' && membership?.LifecycleState === 'InService') {
            if (
                (source.Instances ?? []).some(
                    (member) => !plan.sourceAsg.instanceIds.includes(member.InstanceId)
                )
            ) {
                throw new Error(`Unexpected membership drift in ${asgName} before detach`);
            }
            return 'write';
        }
        return 'wait';
    };
    const action = reconcile(await observe(instance, plan));
    if (action === 'done') {
        return;
    }
    if (action === 'write') {
        // On any error, preserve uncertainty for the caller. A redrive re-observes
        // AWS instead of blindly retrying this command (including SDK retries).
        if (sameAsg) {
            await awsAutoscalingMutations.send(
                new DetachInstancesCommand({
                    InstanceIds: [instance.id],
                    AutoScalingGroupName: asgName,
                    ShouldDecrementDesiredCapacity: false,
                })
            );
        } else {
            await awsAutoscalingMutations.send(
                new SetDesiredCapacityCommand({
                    AutoScalingGroupName: asgName,
                    DesiredCapacity: plan.destinationAsg.desiredCapacity + 1,
                })
            );
        }
    }
    // Load-balancer draining can outlast AddNode. ClusterSizeCheck owns waiting
    // for detach completion and replacement readiness, including in-progress replays.
}

export async function attachInstance(
    instance: Instance,
    asgName: string,
    plan: RotationPlan,
    replacementInstanceId: string
): Promise<void> {
    if (plan.sourceAsg.name !== plan.destinationAsg.name) {
        throw new Error('Reattachment is only valid for a same-ASG rotation');
    }
    const baseline = plan.sourceAsg.desiredCapacity;
    const reconcile = ({ source, membership }: Observation): Reconciliation => {
        checkGroup(source, plan.sourceAsg, [baseline, baseline + 1], [instance.id], 1);
        const members = source.Instances ?? [];
        const replacement = members.filter(
            (member) => !plan.sourceAsg.instanceIds.includes(member.InstanceId)
        );
        if (replacement.length !== 1 || replacement[0].LifecycleState !== 'InService') {
            throw new Error(`Expected one InService replacement before attaching ${instance.id}`);
        }
        if (replacement[0].HealthStatus !== 'Healthy') {
            throw new Error(
                `Expected a Healthy replacement before attaching ${instance.id}; observed ${replacement[0].HealthStatus}`
            );
        }
        if (replacement[0].InstanceId !== replacementInstanceId) {
            throw new Error(
                `Replacement instance identity drift: expected ${replacementInstanceId}, found ${replacement[0].InstanceId}`
            );
        }
        const target = members.find((member) => member.InstanceId === instance.id);
        const states = [target?.LifecycleState, membership?.LifecycleState].filter(
            (state) => state !== undefined
        );
        if (
            states.some(
                (state) =>
                    ![
                        'InService',
                        'Attaching',
                        'Pending',
                        'Pending:Wait',
                        'Pending:Proceed',
                    ].includes(state)
            )
        ) {
            throw new Error(`Unexpected attach lifecycle for ${instance.id}: ${states.join(', ')}`);
        }
        if (
            source.DesiredCapacity === baseline + 1 &&
            target?.LifecycleState === 'InService' &&
            membership?.LifecycleState === 'InService'
        ) {
            return 'done';
        }
        if (!target && !membership && source.DesiredCapacity === baseline) {
            return 'write';
        }
        return 'wait';
    };
    const action = reconcile(await observe(instance, plan));
    if (action === 'done') {
        return;
    }
    if (action === 'write') {
        await awsAutoscalingMutations.send(
            new AttachInstancesCommand({
                InstanceIds: [instance.id],
                AutoScalingGroupName: asgName,
            })
        );
    }
    await retry(
        async () => {
            // After attach is observed or submitted, polling is read-only even if an
            // eventually consistent read looks like the pre-attach state again.
            if (reconcile(await observe(instance, plan)) !== 'done') {
                throw new Error(
                    `Waiting for AWS reconciliation of ${instance.id}; no mutation will be resubmitted`
                );
            }
        },
        `reconciling ${instance.id}`,
        5
    );
}

export type RemovalState = 'InService' | 'EnteringStandby' | 'Standby' | 'Terminating' | 'Terminated';

export async function getRemovalState(
    instance: Instance,
    plan: RotationPlan,
    replacementInstanceId: string
): Promise<RemovalState> {
    const [source, destination, ec2, response] = await Promise.all([
        getASG(plan.sourceAsg.name),
        plan.sourceAsg.name === plan.destinationAsg.name
            ? Promise.resolve(undefined)
            : getASG(plan.destinationAsg.name),
        retry(() => getInstanceState(instance.id), `reading EC2 state for ${instance.id}`, 5),
        retry(
            () => awsAutoscaling.send(
                new DescribeAutoScalingInstancesCommand({ InstanceIds: [instance.id] })
            ),
            `reading ASG membership for ${instance.id}`,
            5
        ),
    ]);
    const sameAsg = plan.sourceAsg.name === plan.destinationAsg.name;
    const beforeStandby = plan.sourceAsg.desiredCapacity + (sameAsg ? 1 : 0);
    const afterStandby = beforeStandby - 1;
    checkGroup(source, plan.sourceAsg, [beforeStandby, afterStandby], [instance.id], sameAsg ? 1 : 0);
    if (!sameAsg) {
        checkGroup(destination, plan.destinationAsg, [plan.destinationAsg.desiredCapacity + 1], [], 1);
    }
    const replacementGroup = sameAsg ? source : destination;
    const replacements = (replacementGroup.Instances ?? []).filter(
        (member) => !plan.destinationAsg.instanceIds.includes(member.InstanceId)
    );
    if (
        replacementInstanceId === instance.id ||
        replacements.length !== 1 ||
        replacements[0].InstanceId !== replacementInstanceId ||
        replacements[0].LifecycleState !== 'InService' ||
        replacements[0].HealthStatus !== 'Healthy'
    ) {
        throw new Error('Replacement identity/health drift before removal');
    }
    const memberships = response.AutoScalingInstances ?? [];
    if (
        memberships.length > 1 ||
        memberships.some(
            (member) =>
                member.InstanceId !== instance.id ||
                member.AutoScalingGroupName !== plan.sourceAsg.name
        )
    ) {
        throw new Error(`Target ${instance.id} has unexpected/wrong ASG membership`);
    }
    const target = source.Instances?.find((member) => member.InstanceId === instance.id);
    const states = [target?.LifecycleState, memberships[0]?.LifecycleState].filter(
        (state) => state !== undefined
    );
    const terminating = (state: string) =>
        ['Terminating', 'Terminating:Wait', 'Terminating:Proceed'].includes(state);
    if (
        states.some(
            (state) =>
                !['InService', 'EnteringStandby', 'Standby'].includes(state) && !terminating(state)
        )
    ) {
        throw new Error(`Unexpected removal lifecycle for ${instance.id}: ${states.join(', ')}`);
    }
    if (ec2 === 'terminated' || ec2 === 'shutting-down' || states.some(terminating)) {
        if (
            source.DesiredCapacity !== afterStandby ||
            states.some((state) => !terminating(state) && state !== 'Standby')
        ) {
            throw new Error(`Unexpected capacity/lifecycle during termination of ${instance.id}`);
        }
        return ec2 === 'terminated' ? 'Terminated' : 'Terminating';
    }
    if (
        ec2 !== 'running' ||
        !target ||
        memberships.length !== 1 ||
        target.LifecycleState !== memberships[0].LifecycleState
    ) {
        throw new Error(
            `Ambiguous removal state for ${instance.id}; reconcile EC2/ASG membership first`
        );
    }
    const state = target.LifecycleState;
    if (
        (state === 'InService' && source.DesiredCapacity !== beforeStandby) ||
        (state === 'Standby' && source.DesiredCapacity !== afterStandby)
    ) {
        throw new Error(`Unexpected desired capacity for ${instance.id} in ${state}`);
    }
    return state as RemovalState;
}

export async function reconcileStandby(
    instance: Instance,
    plan: RotationPlan,
    replacementInstanceId: string
): Promise<RemovalState> {
    const state = await getRemovalState(instance, plan, replacementInstanceId);
    if (state === 'Standby' || state === 'Terminating' || state === 'Terminated') {
        return state;
    }
    if (state === 'InService') {
        await awsAutoscalingMutations.send(
            new EnterStandbyCommand({
                InstanceIds: [instance.id],
                AutoScalingGroupName: plan.sourceAsg.name,
                ShouldDecrementDesiredCapacity: true,
            })
        );
    }
    return retry(
        async () => {
            const observed = await getRemovalState(instance, plan, replacementInstanceId);
            if (observed === 'InService' || observed === 'EnteringStandby') {
                throw new Error(
                    `Waiting for ${instance.id} to reach Standby; no mutation will be resubmitted`
                );
            }
            return observed;
        },
        `waiting for ${instance.id} to reach Standby`,
        30
    );
}

export async function reconcileTermination(
    instance: Instance,
    plan: RotationPlan,
    replacementInstanceId: string
): Promise<void> {
    const state = await getRemovalState(instance, plan, replacementInstanceId);
    if (state === 'Terminated') {
        return;
    }
    if (state === 'Standby') {
        await awsAutoscalingMutations.send(
            new TerminateInstanceInAutoScalingGroupCommand({
                InstanceId: instance.id,
                ShouldDecrementDesiredCapacity: false,
            })
        );
    } else if (state !== 'Terminating') {
        throw new Error(`Refusing to terminate ${instance.id} in ${state}`);
    }
    await retry(
        async () => {
            if (await getRemovalState(instance, plan, replacementInstanceId) !== 'Terminated') {
                throw new Error(
                    `Waiting for confirmed termination of ${instance.id}; no mutation will be resubmitted`
                );
            }
        },
        `waiting for termination of ${instance.id}`,
        20
    );
}

export function describeAsg(asgName: string): Promise<DescribeAutoScalingGroupsCommandOutput> {
    const req = new DescribeAutoScalingGroupsCommand({ AutoScalingGroupNames: [ asgName ] });
    return retry(() => awsAutoscaling.send(req), `describing ASG ${asgName}`, 5)
}

export async function getASG(asgName: string): Promise<AutoScalingGroup> {
    const groups = await describeAsg(asgName)
    const groupNumber = groups.AutoScalingGroups.length;
    if (groupNumber !== 1) {
        throw new Error(`Expected single ASG, but got ${groupNumber}`)
    } else {
        return groups.AutoScalingGroups[0]
    }
}

export async function getASGsByTag(tagKey: string, tagValue: string): Promise<AutoScalingGroup[]> {
    return (await retry<DescribeAutoScalingGroupsCommandOutput>(() => awsAutoscaling.describeAutoScalingGroups({
          Filters: [
              { "Name": `tag${tagValue ? `:${tagKey}` : "-key"}`, Values: [tagValue || tagKey] }
          ]
      }), `finding ASGs with tag '${tagKey}' equal to ${tagValue}`, 5)
    ).AutoScalingGroups;
}
