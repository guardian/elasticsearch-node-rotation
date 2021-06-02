import * as sortBy from 'lodash/sortBy';
import {AsgDiscoveryResponse, StateMachineInput} from './utils/handlerInputs';
import {totalRunningExecutions} from "./aws/stepFunctions";
import {getInstancesByTag} from './aws/ec2Instances';

export async function handler(event: StateMachineInput): Promise<AsgDiscoveryResponse> {
    const runningExecutionsPromise = totalRunningExecutions(event.stepFunctionArn)
    const runningExecutions = await runningExecutionsPromise

    if (runningExecutions !== 1) {
        console.log(`Expected to find one running execution (this one!) but there were ${runningExecutions}.`);
        return { skipRotation: true };
    }

    // We can manually run rotation against a particular autoscaling group if needed
    if(event.asgName) {
        console.log(`AutoScaling group ${event.asgName} specified as input. Moving on...`);
        return { asgName: event.asgName, skipRotation: false };
    }

    const instances = await getInstancesByTag(event.autoScalingGroupDiscoveryTagKey);
    
    console.log(`Found ${instances.length} instances with tag ${event.autoScalingGroupDiscoveryTagKey}`);
    instances.forEach(instance => {
        console.log(`${instance.id} (${instance.autoScalingGroupName}) launched at ${instance.launchTime.toISOString()}}`);
    });

    const threshold = Date.now() - (event.ageThresholdInDays * 24 * 60 * 60 * 1000);
    const oldEnoughInstances = instances.filter(({ launchTime }) => launchTime.getTime() < threshold);

    if(oldEnoughInstances.length === 0) {
        const error = `Could not find any instances to rotate with tag ${event.autoScalingGroupDiscoveryTagKey} older than ${event.ageThresholdInDays} days`;
        return { skipRotation: true };
    }

    const oldestInstance = sortBy(oldEnoughInstances, instance => instance.launchTime)[0];
    console.log(`Found oldest instance ${oldestInstance.id} in AutoScaling group ${oldestInstance.autoScalingGroupName}`);
    console.log(`Triggering rotation for AutoScaling group ${oldestInstance.autoScalingGroupName}`);

    return {
        asgName: oldestInstance.autoScalingGroupName,
        skipRotation: false
    }
}
