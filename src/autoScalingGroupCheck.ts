import { AsgInput } from './utils/handlerInputs';
import {getASG} from "./aws/autoscaling";

export async function handler(event: AsgInput): Promise<AsgInput> {
    try {
        const {MaxSize, Instances} = await getASG(event.asgName)

        if(!Instances) {
            throw new Error("ASG does not have any instances!");
        }

        if (MaxSize <= Instances.length) {
            const error = `ASG MaxSize must be greater than Desired Capacity to allow for ReattachTargetInstance step.`
            throw new Error(error)
        }

        const unhealthyInstanceCount = Instances.filter(i => i.HealthStatus !== 'Healthy').length

        if (unhealthyInstanceCount > 0) {
            const error = `ASG has ${unhealthyInstanceCount} unhealthy instances`;
            throw new Error(error)
        }

        return event;
    } catch (error) {
        console.log(`Failing Step Function execution; ${error}`)
        throw error
    }
}
