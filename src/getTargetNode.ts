import {AsgDiscoveryResponse, StateMachineInput} from './utils/handlerInputs';
import {totalRunningExecutions} from "./aws/stepFunctions";
import {getInstancesByTag} from './aws/ec2Instances';
import {getASGsByTag} from "./aws/autoscaling";
import {Elasticsearch} from "./elasticsearch/elasticsearch";
import {Instance} from "./aws/types";
import { type AutoScalingGroup } from '@aws-sdk/client-auto-scaling';

function asgTagsToRecord(asg: AutoScalingGroup): Record<string, string> {
  return Object.fromEntries(
    (asg.Tags ?? [])
      .filter(tag => tag.Key !== undefined && tag.Value !== undefined)
      .map(tag => [tag.Key!, tag.Value!])
  );
}

/** attempt to find an ASG with the same tagging as the target instance's,
  * but identifies itself as a 'new' ASG (using the 'gu:riffraff:new-asg'
  * tag) so should be the destination of the node rotation.
  * Only respects the Stage/Stack/App tags, when defined on the target
  * instance's ASG.
  */
function findNewAsgMatchingInstanceAsg(
  eligibleASGs: AutoScalingGroup[],
  targetInstance: Instance,
): AutoScalingGroup | undefined {

  const targetInstanceAsg = eligibleASGs
    .find(a => a.AutoScalingGroupName === targetInstance.autoScalingGroupName);

  if (!targetInstanceAsg) {
    throw new Error(`Couldn't find target instance's ASG (${targetInstance.autoScalingGroupName}) in the list of eligible ASGs - that shouldn't happen!`);
  }

  const targetAsgTags = asgTagsToRecord(targetInstanceAsg);
  const expectedTags = ['App', 'Stack', 'Stage'].filter(t => t in targetAsgTags);

  const newAsg = eligibleASGs.find(a => {
    const asgTags = asgTagsToRecord(a);

    return a.AutoScalingGroupName !== targetInstanceAsg.AutoScalingGroupName
      && expectedTags.every(t => asgTags[t] === targetAsgTags[t])
      && 'gu:riffraff:new-asg' in asgTags;
  });

  return newAsg;

}

export async function handler(event: StateMachineInput): Promise<AsgDiscoveryResponse> {
    const runningExecutionsPromise = totalRunningExecutions(event.stepFunctionArn)
    const runningExecutions = await runningExecutionsPromise

    if (runningExecutions !== 1) {
        console.log(`Expected to find one running execution (this one!) but there were ${runningExecutions}.`);
        return { skipRotation: true };
    }

    const eligibleASGs = await getASGsByTag(event.autoScalingGroupDiscoveryTagKey, "true");

    const eligibleInstances = (
      // TODO it would be nice to not need the Tags on the instances as well, but currently used in the ElasticsearchAdminSsmPolicy IAM policy in cloudformation.yaml
      await getInstancesByTag(event.autoScalingGroupDiscoveryTagKey, "true")
    ).filter(i => eligibleASGs.some(a => a.AutoScalingGroupName === i.autoScalingGroupName));

    // We can manually run rotation against a particular instance if needed
    if(event.targetInstanceId) {
        const targetInstance = eligibleInstances.find(i => i.id === event.targetInstanceId);
        if(!targetInstance){
            throw Error(
              `The specified 'targetInstanceId' doesn't belong to an ASG with the 
              '${event.autoScalingGroupDiscoveryTagKey}' Tag set to 'true', 
              or the instance itself doesn't have that tag set to true.`
            );
        }
        const asgName = targetInstance.autoScalingGroupName;
        const targetInstanceId = targetInstance.id;
        const elasticsearchClient = new Elasticsearch(targetInstanceId);
        const targetElasticSearchNode = await elasticsearchClient.getElasticsearchNode(targetInstance);
        console.log(`Instance ${targetInstanceId} (ASG: ${asgName}) specified as input. Moving on...`);

        const maybeNewAsg = findNewAsgMatchingInstanceAsg(eligibleASGs, targetInstance);

        const destinationAsgName = maybeNewAsg?.AutoScalingGroupName ?? asgName;
        return { destinationAsgName, targetElasticSearchNode, skipRotation: false };
    }

    console.log(`Found ${eligibleInstances.length} instances with tag ${event.autoScalingGroupDiscoveryTagKey}`);
    eligibleInstances.forEach(instance => {
        console.log(`${instance.id} (${instance.autoScalingGroupName}) launched at ${instance.launchTime.toISOString()}}`);
    });

    const threshold = Date.now() - (event.ageThresholdInDays * 24 * 60 * 60 * 1000);
    const oldEnoughInstances = eligibleInstances.filter(({ launchTime }) => launchTime.getTime() < threshold);

    if(oldEnoughInstances.length === 0) {
        console.log(`Could not find any instances to rotate with tag ${event.autoScalingGroupDiscoveryTagKey} older than ${event.ageThresholdInDays} days`);
        return { skipRotation: true };
    }

    const oldestInstance = findOldestInstance(oldEnoughInstances);
    const elasticsearchClient = new Elasticsearch(oldestInstance.id);
    const targetElasticSearchNode = await elasticsearchClient.getElasticsearchNode(oldestInstance);
    console.log(`Triggering rotation of oldest instance ${oldestInstance.id} (ASG: ${oldestInstance.autoScalingGroupName})`);

    const maybeNewAsg = findNewAsgMatchingInstanceAsg(eligibleASGs, oldestInstance);
    return {
        destinationAsgName: maybeNewAsg?.AutoScalingGroupName ?? oldestInstance.autoScalingGroupName,
        targetElasticSearchNode,
        skipRotation: false
    }
}

export const findOldestInstance = (instances: Instance[]): Instance => {
    const [head] = instances.sort(({ launchTime: launchTimeA }: Instance, { launchTime: launchTimeB }: Instance) => {
        if(launchTimeA < launchTimeB) {
            return -1;
        }
        if(launchTimeA > launchTimeB) {
            return 1;
        }
        return 0;
    });

    return head;
}
