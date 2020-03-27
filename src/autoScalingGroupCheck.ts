import {
    AutoScalingGroupCheckResponse,
    StateMachineInput
} from './utils/handlerInputs';
import {getASG} from "./aws/autoscaling";
import {totalRunningExecutions} from "./aws/stepFunctions";

export async function handler(event: StateMachineInput): Promise<AutoScalingGroupCheckResponse> {
    try {
        const runningExecutionsPromise = totalRunningExecutions(event.stepFunctionArn)
        const runningExecutions = await runningExecutionsPromise

        if (runningExecutions !== 1) {
            const error = `Expected to find one running execution (this one!) but there were ${runningExecutions}.`
            throw new Error(error)
        }

        const asg = await getASG(event.asgName)

        if (asg.MaxSize <= asg.Instances.length) {
            const error = `ASG MaxSize must be greater than Desired Capacity to allow for ReattachOldInstance step.`
            throw new Error(error)
        }

        const instanceIds = asg.Instances.map(i  => i.InstanceId)
        const unhealthyInstanceCount = asg.Instances.filter(i => i.HealthStatus !== 'Healthy').length

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
