import {
    AutoScalingGroupCheckResponse,
    AsgInput
} from './utils/handlerInputs';
import {getASG} from "./aws/autoscaling";

export async function handler(event: AsgInput): Promise<AutoScalingGroupCheckResponse> {
    try {
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
