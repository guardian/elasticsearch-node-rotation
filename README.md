# elasticsearch-node-rotation

This [AWS Step Function](https://aws.amazon.com/step-functions/) is used to rotate the nodes in an Elasticsearch cluster, 
without interrupting the availability of data.

It is designed so that node rotations can be scheduled frequently, in order to regularly update the underlying AMI 
(Amazon Machine Image) of each EC2 instance. We use this tool in combination with [AMIgo](https://github.com/guardian/amigo) 
(for baking AMIs) and [Riff-Raff](https://github.com/guardian/riff-raff) (for updating the AMI associated with an AutoScaling 
Group).

## Assumptions

The project assumes that each Elasticsearch node is running on a dedicated EC2 instance, which is part of an 
ASG (AutoScaling Group).

## Setting up node rotations for an Elasticsearch cluster

1. Ensure that all EC2 instances are running the [AWS SSM agent](https://docs.aws.amazon.com/systems-manager/latest/userguide/ssm-agent.html). 
1. Create an S3 bucket (or choose an existing one), to store SSM command output. This is only required temporarily, so you may wish to 
[configure object expiration](https://docs.aws.amazon.com/AmazonS3/latest/dev/lifecycle-expire-general-considerations.html) for this bucket.
1. Ensure that all EC2 instances have the [required permissions](#aws-permissions).
1. Create a new Cloudformation stack, using the [template](https://github.com/guardian/elasticsearch-node-rotation/blob/master/cloudformation.yaml)
in this project. The frequency of node rotations is passed into the template as a parameter.
1. Add `RotateWithElasticsearchNodeRotation: true` as a tag the AutoScaling groups containing the instances that will be rotated
1. Update the AMI associated with your AutoScaling Groups on a regular basis (using Riff-Raff's scheduled deploy feature).


### Running Manually
Sometimes it's useful to rotate an ES node manually (e.g. during an ES upgrade), you can optionally pass a `targetInstanceId` in the step function input object. It's usually easiest to open an existing execution and click `New Execution` then just edit the input object. 

## Implementation

This Step Function triggers a number of TypeScript lambdas, which coordinate the process of replacing a node by:

* Performing various sanity checks and identifying a node to rotate
* Adding a new node into the cluster
* Migrating all data from the target node onto the new node (if data is present)
* Shutting down Elasticsearch on the empty node
* Terminating the unused EC2 instance

In order to ensure that the new EC2 instance is brought up in the same Availablity Zone as the target EC2 instance, 
the target instance is [detached](https://docs.aws.amazon.com/autoscaling/ec2/userguide/detach-instance-asg.html) from its ASG
during the node rotation process.

In order to move all data off the target EC2 instance, the node is excluded from 
[shard allocation](https://www.elastic.co/guide/en/elasticsearch/reference/current/allocation-filtering.html). 
Shard [rebalancing](https://www.elastic.co/guide/en/elasticsearch/reference/current/shards-allocation.html#_shard_rebalancing_settings)
is temporarily disabled during the rotation process, to prevent Elasticsearch from moving shards unnecessarily.

## AWS Permissions

This Step Function requires a number of IAM permissions in order to control the number of running EC2 instances 
and run commands against Elasticsearch nodes (which is achieved via SSM's EC2 Run Command). Full details of the permissions
required can be found in this project's Cloudformation [template](https://github.com/guardian/elasticsearch-node-rotation/blob/master/cloudformation.yaml)

The EC2 instances (which are subject to rotation) will require the following IAM permissions in order to handle incoming SSM commands: 

```
Statement:
- Effect: Allow
  Action:
  - ec2messages:AcknowledgeMessage
  - ec2messages:DeleteMessage
  - ec2messages:FailMessage
  - ec2messages:GetEndpoint
  - ec2messages:GetMessages
  - ec2messages:SendReply
  - ssm:UpdateInstanceInformation
  - ssm:ListInstanceAssociations
  - ssm:DescribeInstanceProperties
  - ssm:DescribeDocumentParameters
  Resource: "*"
- Effect: Allow
  Action:
  - s3:PutObject
  Resource:
  - arn:aws:s3:::<your_bucket_name_here>/*
```

