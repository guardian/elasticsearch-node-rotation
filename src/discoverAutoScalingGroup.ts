import * as sortBy from 'lodash/sortBy';
import {AsgDiscoveryResponse, StateMachineInput} from './utils/handlerInputs';
import {totalRunningExecutions} from "./aws/stepFunctions";
import {getInstancesByTag} from './aws/ec2Instances';

export async function handler(event: StateMachineInput): Promise<AsgDiscoveryResponse> {
    const runningExecutionsPromise = totalRunningExecutions(event.stepFunctionArn)
    const runningExecutions = await runningExecutionsPromise

    if (runningExecutions !== 1) {
        const error = `Expected to find one running execution (this one!) but there were ${runningExecutions}.`;
        return { alreadyRunning: true };
    }

    // We can manually run rotation against a particular autoscaling group if needed
    if(event.asgName) {
        console.log(`AutoScaling group ${event.asgName} specified as input. Moving on...`);
        return { asgName: event.asgName, alreadyRunning: false };
    }

    const instances = await getInstancesByTag(event.autoScalingGroupDiscoveryTagKey);
    
    if(instances.length === 0) {
        const error = `Could not find any instances to rotate with tag ${event.autoScalingGroupDiscoveryTagKey}.`;
        throw new Error(error);
    }

    const oldestInstance = sortBy(instances, instance => instance.launchTime)[0];
    console.log(`Found oldest instance ${oldestInstance.id} in AutoScaling group ${oldestInstance.autoScalingGroupName}`);
    console.log(`Triggering rotation for AutoScaling group ${oldestInstance.autoScalingGroupName}`);

    return {
        asgName: oldestInstance.autoScalingGroupName,
        alreadyRunning: false
    }
}
