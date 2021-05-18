import { discoverASGs } from './aws/autoscaling';
import {DiscoveredAsgsInput, StateMachineInput} from './utils/handlerInputs';
import {totalRunningExecutions} from "./aws/stepFunctions";

export async function handler(event: StateMachineInput): Promise<DiscoveredAsgsInput> {
    const runningExecutionsPromise = totalRunningExecutions(event.stepFunctionArn)
    const runningExecutions = await runningExecutionsPromise

    if (runningExecutions !== 1) {
        const error = `Expected to find one running execution (this one!) but there were ${runningExecutions}.`
        throw new Error(error)
    }

    // TODO MRB: group autoscaling groups by Stack, App, Stage as a proxy for cluster and pick the one with the oldest instance
    const asgs = await discoverASGs(event.autoScalingGroupDiscoveryTagKey);

    if(asgs.length === 0) {
        const message = `Couldn't find any AutoScaling groups with tag ${event.autoScalingGroupDiscoveryTagKey}`;
        console.log(message);

        throw message;
    }

    const asgNames = asgs.map(asg => asg.AutoScalingGroupName);

    return {
        asgNames: asgNames.map(asgName => {
            return { asgName };
        })
    }
}
