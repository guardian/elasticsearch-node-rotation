import {
    AutoScalingGroupCheckResponse,
    StateMachineInput
} from './utils/handlerInputs';
import {describeAsg} from "./aws/autoscaling";
import {totalRunningExecutions} from "./aws/stepFunctions";
import {AutoScalingGroup, AutoScalingGroups} from "aws-sdk/clients/autoscaling";


export async function handler(event: StateMachineInput): Promise<AutoScalingGroupCheckResponse> {
    try {
        const runningExecutionsPromise = totalRunningExecutions(event.stepFunctionArn)
        const runningExecutions = await runningExecutionsPromise

        if (runningExecutions !== 1) {
            const error = `Expected to find one running execution (this one!) but there were ${runningExecutions}.`
            throw new Error(error)
        }

        const asgPromise = describeAsg(event.asgName)
        const asgs = await asgPromise
        const singleAsg = singleASG(asgs.AutoScalingGroups)

        if (singleAsg.MaxSize == singleAsg.DesiredCapacity) {
            const error = `ASG MaxSize must be greater than Desired Capacity to allow for ReattachOldInstance step.`
            throw new Error(error)
        }

        const instanceIds = singleAsg.Instances.map(i  => i.InstanceId)
        const unhealthyInstanceCount = singleAsg.Instances.filter(i => i.HealthStatus !== 'Healthy').length

        if (unhealthyInstanceCount > 0) {
            const error = `ASG has ${unhealthyInstanceCount} unhealthy instances`;
            throw new Error(error)
        }

        return ({
            asgName: event.asgName,
            instanceIds: instanceIds
        })
    } catch (error) {
        console.log(`Failing Step Function execution; ${error}`)
        throw error
    }
}

export function singleASG(groups: AutoScalingGroups): AutoScalingGroup {
    const groupNumber = groups.length;
    if (groupNumber !== 1) {
        throw new Error(`Expected single ASG, but got ${groupNumber}`)
    } else {
        return groups[0]
    }
}
