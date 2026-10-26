import { DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { getInstanceState } from '../src/aws/ec2Instances';

jest.mock('@aws-sdk/client-ec2', () => ({
    ...jest.requireActual('@aws-sdk/client-ec2'),
    EC2: jest.fn().mockImplementation(() => ({
        send: (command: DescribeInstancesCommand) => mockSend(command),
    })),
}));

const mockSend = jest.fn();

beforeEach(() => jest.clearAllMocks());

describe('getInstanceState', () => {
    it.each(['running', 'terminated'])('reads actual lifecycle %s without an ASG tag', async (state) => {
        mockSend.mockResolvedValue({
            Reservations: [{ Instances: [{ InstanceId: 'i-target', State: { Name: state } }] }],
        });
        await expect(getInstanceState('i-target')).resolves.toBe(state);
        expect(mockSend.mock.calls[0][0]).toBeInstanceOf(DescribeInstancesCommand);
        expect(mockSend.mock.calls[0][0].input).toEqual({ InstanceIds: ['i-target'] });
    });

    it.each([
        {},
        { Reservations: [{ Instances: [{ InstanceId: 'i-target' }] }] },
        { Reservations: [{ Instances: [{ InstanceId: 'i-wrong', State: { Name: 'running' } }] }] },
    ])('fails closed on missing or inconsistent visibility (%p)', async (response) => {
        mockSend.mockResolvedValue(response);
        await expect(getInstanceState('i-target')).rejects.toThrow(
            'missing data does not imply termination'
        );
    });

    it('propagates eventual-consistency errors instead of reporting termination', async () => {
        const error = Object.assign(new Error('not visible yet'), {
            name: 'InvalidInstanceID.NotFound',
        });
        mockSend.mockRejectedValue(error);
        await expect(getInstanceState('i-target')).rejects.toBe(error);
    });
});
