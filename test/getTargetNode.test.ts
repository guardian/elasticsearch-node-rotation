import { handler } from '../src/getTargetNode';
import { totalRunningExecutions } from '../src/aws/stepFunctions';
import { getInstancesByTag } from '../src/aws/ec2Instances';
import { getASGsByTag } from '../src/aws/autoscaling';
import { Elasticsearch } from '../src/elasticsearch/elasticsearch';
import { StateMachineInput } from '../src/utils/handlerInputs';
import { Instance } from '../src/aws/types';
import { AutoScalingGroup } from '@aws-sdk/client-auto-scaling';

jest.mock('../src/aws/stepFunctions');
jest.mock('../src/aws/ec2Instances');
jest.mock('../src/aws/autoscaling');
jest.mock('../src/elasticsearch/elasticsearch');

const mockedTotalRunningExecutions = totalRunningExecutions as jest.MockedFunction<typeof totalRunningExecutions>;
const mockedGetInstancesByTag = getInstancesByTag as jest.MockedFunction<typeof getInstancesByTag>;
const mockedGetASGsByTag = getASGsByTag as jest.MockedFunction<typeof getASGsByTag>;

describe('getTargetNode handler', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should skip rotation when multiple executions are running', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(2);

        const event: StateMachineInput = {
            stepFunctionArn: 'arn:aws:states:us-east-1:123456789:stateMachine:test',
            autoScalingGroupDiscoveryTagKey: 'es-rotation',
            ageThresholdInDays: 7,
        };

        const result = await handler(event);

        expect(result).toEqual({ skipRotation: true });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedGetInstancesByTag).not.toHaveBeenCalled();
        expect(mockedGetASGsByTag).not.toHaveBeenCalled();
    });

    it('should skip rotation if there are no instances tagged for rotation', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(1);
        mockedGetInstancesByTag.mockResolvedValue([]);

        const event: StateMachineInput = {
            stepFunctionArn: 'arn:aws:states:us-east-1:123456789:stateMachine:test',
            autoScalingGroupDiscoveryTagKey: 'es-rotation',
            ageThresholdInDays: 7,
        };

        const result = await handler(event);

        expect(result).toEqual({ skipRotation: true });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedGetInstancesByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");

    });

    it('should skip rotation if all instances tagged for rotation are too old', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(1);

        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        const mockInstances: Instance[] = [
            { id: 'i-123', launchTime: twoDaysAgo, autoScalingGroupName: 'asg-1', privateIp: 'IP' },
            { id: 'i-456', launchTime: twoDaysAgo, autoScalingGroupName: 'asg-1', privateIp: 'IP' },
        ];

        mockedGetInstancesByTag.mockResolvedValue(mockInstances);

        const mockASGs: AutoScalingGroup[] = [
            { AutoScalingGroupName: 'asg-1', Tags: [{ Key: 'es-rotation', Value: 'true' }], MinSize: 1, MaxSize: 3, DesiredCapacity: 2, DefaultCooldown: 300, AvailabilityZones: ['us-east-1a'], HealthCheckType: 'EC2', CreatedTime: twoYearsAgo },
        ];

        mockedGetASGsByTag.mockResolvedValue(mockASGs);

        const event: StateMachineInput = {
            stepFunctionArn: 'arn:aws:states:us-east-1:123456789:stateMachine:test',
            autoScalingGroupDiscoveryTagKey: 'es-rotation',
            ageThresholdInDays: 7,
        };

        const result = await handler(event);

        expect(result).toEqual({ skipRotation: true });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedGetInstancesByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
    });

    it('should return the oldest instance and its ASG when a suitable instance is found', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(1);

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const twentyDaysAgo = new Date();
        twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

        const mockInstances: Instance[] = [
            { id: 'i-123', launchTime: tenDaysAgo, autoScalingGroupName: 'asg-1', privateIp: '10.0.0.1' },
            { id: 'i-456', launchTime: twentyDaysAgo, autoScalingGroupName: 'asg-1', privateIp: '10.0.0.2' },
        ];

        mockedGetInstancesByTag.mockResolvedValue(mockInstances);

        const mockASGs: AutoScalingGroup[] = [
            { AutoScalingGroupName: 'asg-1', Tags: [{ Key: 'es-rotation', Value: 'true' }], MinSize: 1, MaxSize: 3, DesiredCapacity: 2, DefaultCooldown: 300, AvailabilityZones: ['us-east-1a'], HealthCheckType: 'EC2', CreatedTime: new Date() },
        ];

        mockedGetASGsByTag.mockResolvedValue(mockASGs);

        const mockElasticsearch = {
            getElasticsearchNode: jest.fn().mockImplementation((instance: Instance) =>
                ({ ec2Instance: instance, nodeId: 'node-456', isMasterEligible: true })),
        };
        (Elasticsearch as jest.MockedClass<typeof Elasticsearch>).mockImplementation(() => mockElasticsearch as any);

        const event: StateMachineInput = {
            stepFunctionArn: 'arn:aws:states:us-east-1:123456789:stateMachine:test',
            autoScalingGroupDiscoveryTagKey: 'es-rotation',
            ageThresholdInDays: 7,
        };

        const result = await handler(event);

        expect(result).toEqual({
            skipRotation: false,
            targetElasticSearchNode: {
                ec2Instance: mockInstances[1],
                nodeId: 'node-456',
                isMasterEligible: true
            },
            destinationAsgName: 'asg-1',
        });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedGetInstancesByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockedGetASGsByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockElasticsearch.getElasticsearchNode).toHaveBeenCalledWith(mockInstances[1]);
    });

    it('should return the specified target instance when provided in the event', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(1);

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const twentyDaysAgo = new Date();
        twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

        const mockInstances: Instance[] = [
            { id: 'i-123', launchTime: tenDaysAgo, autoScalingGroupName: 'asg-1', privateIp: '10.0.0.1' },
            { id: 'i-456', launchTime: twentyDaysAgo, autoScalingGroupName: 'asg-1', privateIp: '10.0.0.2' },
        ];

        mockedGetInstancesByTag.mockResolvedValue(mockInstances);

        const mockASGs: AutoScalingGroup[] = [
            { AutoScalingGroupName: 'asg-1', Tags: [{ Key: 'es-rotation', Value: 'true' }], MinSize: 1, MaxSize: 3, DesiredCapacity: 2, DefaultCooldown: 300, AvailabilityZones: ['us-east-1a'], HealthCheckType: 'EC2', CreatedTime: new Date() },
        ];

        mockedGetASGsByTag.mockResolvedValue(mockASGs);

        const mockElasticsearch = {
            getElasticsearchNode: jest.fn().mockImplementation((instance: Instance) =>
                ({ ec2Instance: instance, nodeId: 'node-123', isMasterEligible: false })),
        };
        (Elasticsearch as jest.MockedClass<typeof Elasticsearch>).mockImplementation(() => mockElasticsearch as any);

        const event: StateMachineInput = {
            stepFunctionArn: 'arn:aws:states:us-east-1:123456789:stateMachine:test',
            autoScalingGroupDiscoveryTagKey: 'es-rotation',
            ageThresholdInDays: 7,
            targetInstanceId: 'i-123', // an old instance, but not the oldest
        };

        const result = await handler(event);

        expect(result).toEqual({
            skipRotation: false,
            targetElasticSearchNode: {
                ec2Instance: mockInstances[0],
                nodeId: 'node-123',
                isMasterEligible: false
            },
            destinationAsgName: 'asg-1',
        });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedGetInstancesByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockedGetASGsByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockElasticsearch.getElasticsearchNode).toHaveBeenCalledWith(mockInstances[0]);
    });

    it('should rotate a node into a new ASG if one exists with the new asg tag', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(1);

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const twentyDaysAgo = new Date();
        twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

        const mockInstances: Instance[] = [
            { id: 'i-123', launchTime: tenDaysAgo, autoScalingGroupName: 'asg-old', privateIp: '10.0.0.1' },
            { id: 'i-456', launchTime: twentyDaysAgo, autoScalingGroupName: 'asg-old', privateIp: '10.0.0.2' },
        ];

        mockedGetInstancesByTag.mockResolvedValue(mockInstances);

        const mockASGs: AutoScalingGroup[] = [
            { AutoScalingGroupName: 'asg-old', Tags: [{ Key: 'es-rotation', Value: 'true' }], MinSize: 1, MaxSize: 3, DesiredCapacity: 2, DefaultCooldown: 300, AvailabilityZones: ['us-east-1a'], HealthCheckType: 'EC2', CreatedTime: new Date() },
            { AutoScalingGroupName: 'asg-new', Tags: [{ Key: 'es-rotation', Value: 'true' }, { Key: 'gu:riffraff:new-asg', Value: 'true' }], MinSize: 0, MaxSize: 3, DesiredCapacity: 0, DefaultCooldown: 300, AvailabilityZones: ['us-east-1a'], HealthCheckType: 'EC2', CreatedTime: new Date() },
        ];

        mockedGetASGsByTag.mockResolvedValue(mockASGs);

        const mockElasticsearch = {
            getElasticsearchNode: jest.fn().mockImplementation((instance: Instance) =>
                ({ ec2Instance: instance, nodeId: 'node-456', isMasterEligible: true })),
        };
        (Elasticsearch as jest.MockedClass<typeof Elasticsearch>).mockImplementation(() => mockElasticsearch as any);

        const event: StateMachineInput = {
            stepFunctionArn: 'arn:aws:states:us-east-1:123456789:stateMachine:test',
            autoScalingGroupDiscoveryTagKey: 'es-rotation',
            ageThresholdInDays: 7,
        };

        const result = await handler(event);

        expect(result).toEqual({
            skipRotation: false,
            targetElasticSearchNode: {
                ec2Instance: mockInstances[1],
                nodeId: 'node-456',
                isMasterEligible: true
            },
            destinationAsgName: 'asg-new',
        });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedGetInstancesByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockedGetASGsByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockElasticsearch.getElasticsearchNode).toHaveBeenCalledWith(mockInstances[1]);
    });

    it('should not rotate a node into a new ASG if it doesn\'t match with other tags', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(1);

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const twentyDaysAgo = new Date();
        twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

        const mockInstances: Instance[] = [
            { id: 'i-123', launchTime: tenDaysAgo, autoScalingGroupName: 'asg-old', privateIp: '10.0.0.1' },
            { id: 'i-456', launchTime: twentyDaysAgo, autoScalingGroupName: 'asg-old', privateIp: '10.0.0.2' },
        ];

        mockedGetInstancesByTag.mockResolvedValue(mockInstances);

        const mockASGs: AutoScalingGroup[] = [
            { AutoScalingGroupName: 'asg-old', Tags: [{ Key: 'es-rotation', Value: 'true' }, { Key: 'Stage', Value: 'CODE' }], MinSize: 1, MaxSize: 3, DesiredCapacity: 2, DefaultCooldown: 300, AvailabilityZones: ['us-east-1a'], HealthCheckType: 'EC2', CreatedTime: new Date() },
            { AutoScalingGroupName: 'asg-new', Tags: [{ Key: 'es-rotation', Value: 'true' }, { Key: 'Stage', Value: 'PROD' }, { Key: 'gu:riffraff:new-asg', Value: 'true' }], MinSize: 0, MaxSize: 3, DesiredCapacity: 0, DefaultCooldown: 300, AvailabilityZones: ['us-east-1a'], HealthCheckType: 'EC2', CreatedTime: new Date() },
        ];

        mockedGetASGsByTag.mockResolvedValue(mockASGs);

        const mockElasticsearch = {
            getElasticsearchNode: jest.fn().mockImplementation((instance: Instance) =>
                ({ ec2Instance: instance, nodeId: 'node-456', isMasterEligible: true })),
        };
        (Elasticsearch as jest.MockedClass<typeof Elasticsearch>).mockImplementation(() => mockElasticsearch as any);

        const event: StateMachineInput = {
            stepFunctionArn: 'arn:aws:states:us-east-1:123456789:stateMachine:test',
            autoScalingGroupDiscoveryTagKey: 'es-rotation',
            ageThresholdInDays: 7,
        };

        const result = await handler(event);

        expect(result).toEqual({
            skipRotation: false,
            targetElasticSearchNode: {
                ec2Instance: mockInstances[1],
                nodeId: 'node-456',
                isMasterEligible: true
            },
            destinationAsgName: 'asg-old', // despite there being a new ASG, it doesn't match so rotate into the old ASG
        });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedGetInstancesByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockedGetASGsByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockElasticsearch.getElasticsearchNode).toHaveBeenCalledWith(mockInstances[1]);
    });

    it('should rotate a chosen node into a new ASG if there is one with matching tags', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(1);

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const twentyDaysAgo = new Date();
        twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

        const mockInstances: Instance[] = [
            { id: 'i-123', launchTime: tenDaysAgo, autoScalingGroupName: 'asg-old', privateIp: '10.0.0.1' },
            { id: 'i-456', launchTime: twentyDaysAgo, autoScalingGroupName: 'asg-old', privateIp: '10.0.0.2' },
        ];

        mockedGetInstancesByTag.mockResolvedValue(mockInstances);

        const mockASGs: AutoScalingGroup[] = [
            { AutoScalingGroupName: 'asg-old', Tags: [{ Key: 'es-rotation', Value: 'true' }, { Key: 'Stage', Value: 'PROD' }], MinSize: 1, MaxSize: 3, DesiredCapacity: 2, DefaultCooldown: 300, AvailabilityZones: ['us-east-1a'], HealthCheckType: 'EC2', CreatedTime: new Date() },
            { AutoScalingGroupName: 'asg-new', Tags: [{ Key: 'es-rotation', Value: 'true' }, { Key: 'Stage', Value: 'PROD' }, { Key: 'gu:riffraff:new-asg', Value: 'true' }], MinSize: 0, MaxSize: 3, DesiredCapacity: 0, DefaultCooldown: 300, AvailabilityZones: ['us-east-1a'], HealthCheckType: 'EC2', CreatedTime: new Date() },
        ];

        mockedGetASGsByTag.mockResolvedValue(mockASGs);

        const mockElasticsearch = {
            getElasticsearchNode: jest.fn().mockImplementation((instance: Instance) =>
                ({ ec2Instance: instance, nodeId: instance.id, isMasterEligible: true })),
        };
        (Elasticsearch as jest.MockedClass<typeof Elasticsearch>).mockImplementation(() => mockElasticsearch as any);

        const event: StateMachineInput = {
            stepFunctionArn: 'arn:aws:states:us-east-1:123456789:stateMachine:test',
            autoScalingGroupDiscoveryTagKey: 'es-rotation',
            ageThresholdInDays: 7,
            targetInstanceId: 'i-123',
        };

        const result = await handler(event);

        expect(result).toEqual({
            skipRotation: false,
            targetElasticSearchNode: {
                ec2Instance: mockInstances[0],
                nodeId: 'i-123',
                isMasterEligible: true
            },
            destinationAsgName: 'asg-new',
        });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedGetInstancesByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockedGetASGsByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockElasticsearch.getElasticsearchNode).toHaveBeenCalledWith(mockInstances[0]);
    });

    it('should not rotate a chosen node into a new ASG if there is not one with matching tags', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(1);

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        const twentyDaysAgo = new Date();
        twentyDaysAgo.setDate(twentyDaysAgo.getDate() - 20);

        const mockInstances: Instance[] = [
            { id: 'i-123', launchTime: tenDaysAgo, autoScalingGroupName: 'asg-old', privateIp: '10.0.0.1' },
            { id: 'i-456', launchTime: twentyDaysAgo, autoScalingGroupName: 'asg-old', privateIp: '10.0.0.2' },
        ];

        mockedGetInstancesByTag.mockResolvedValue(mockInstances);

        const mockASGs: AutoScalingGroup[] = [
            { AutoScalingGroupName: 'asg-old', Tags: [{ Key: 'es-rotation', Value: 'true' }, { Key: 'Stage', Value: 'CODE' }], MinSize: 1, MaxSize: 3, DesiredCapacity: 2, DefaultCooldown: 300, AvailabilityZones: ['us-east-1a'], HealthCheckType: 'EC2', CreatedTime: new Date() },
            { AutoScalingGroupName: 'asg-new', Tags: [{ Key: 'es-rotation', Value: 'true' }, { Key: 'Stage', Value: 'PROD' }, { Key: 'gu:riffraff:new-asg', Value: 'true' }], MinSize: 0, MaxSize: 3, DesiredCapacity: 0, DefaultCooldown: 300, AvailabilityZones: ['us-east-1a'], HealthCheckType: 'EC2', CreatedTime: new Date() },
        ];

        mockedGetASGsByTag.mockResolvedValue(mockASGs);

        const mockElasticsearch = {
            getElasticsearchNode: jest.fn().mockImplementation((instance: Instance) =>
                ({ ec2Instance: instance, nodeId: instance.id, isMasterEligible: true })),
        };
        (Elasticsearch as jest.MockedClass<typeof Elasticsearch>).mockImplementation(() => mockElasticsearch as any);

        const event: StateMachineInput = {
            stepFunctionArn: 'arn:aws:states:us-east-1:123456789:stateMachine:test',
            autoScalingGroupDiscoveryTagKey: 'es-rotation',
            ageThresholdInDays: 7,
            targetInstanceId: 'i-123',
        };

        const result = await handler(event);

        expect(result).toEqual({
            skipRotation: false,
            targetElasticSearchNode: {
                ec2Instance: mockInstances[0],
                nodeId: 'i-123',
                isMasterEligible: true
            },
            destinationAsgName: 'asg-old',
        });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedGetInstancesByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockedGetASGsByTag).toHaveBeenCalledWith(event.autoScalingGroupDiscoveryTagKey, "true");
        expect(mockElasticsearch.getElasticsearchNode).toHaveBeenCalledWith(mockInstances[0]);
    });
});
