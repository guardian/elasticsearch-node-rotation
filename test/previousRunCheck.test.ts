import { handler } from '../src/previousRunCheck';
import { previousExecutionFailed, totalRunningExecutions } from '../src/aws/stepFunctions';
import type { StateMachineInput } from '../src/utils/handlerInputs';

jest.mock('../src/aws/stepFunctions');

const mockedTotalRunningExecutions = totalRunningExecutions as jest.MockedFunction<typeof totalRunningExecutions>;
const mockedPreviousExecutionFailed = previousExecutionFailed as jest.MockedFunction<typeof previousExecutionFailed>;

describe('previousRunCheck handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const event: StateMachineInput = {
        stepFunctionArn: 'arn:aws:states:us-east-1:123456789:stateMachine:test',
        autoScalingGroupDiscoveryTagKey: 'es-rotation',
        ageThresholdInDays: 7,
        skipFailureCheck: false,
    };

    it('allows rotation when only the current execution is running', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(1);
        mockedPreviousExecutionFailed.mockResolvedValue(false);

        await expect(handler(event)).resolves.toEqual({ ...event, skipRotation: false });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedPreviousExecutionFailed).toHaveBeenCalledWith(event.stepFunctionArn);
    });

    it('skips rotation when another execution is running', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(2);

        await expect(handler(event)).resolves.toEqual({ ...event, skipRotation: true });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedPreviousExecutionFailed).not.toHaveBeenCalled();
    });

    it('fails the check when the previous execution failed', async () => {
        mockedTotalRunningExecutions.mockResolvedValue(1);
        mockedPreviousExecutionFailed.mockResolvedValue(true);

        await expect(handler(event)).rejects.toThrow('Previous execution failed; refusing to continue rotation.');
    });

    it('propagates failures when querying execution history fails', async () => {
        const error = new Error('history unavailable');
        mockedTotalRunningExecutions.mockResolvedValue(1);
        mockedPreviousExecutionFailed.mockRejectedValue(error);

        await expect(handler(event)).rejects.toBe(error);
    });

    it('allows rotation even when previous execution failed if skipFailureCheck is true', async () => {
        const skipAllowedEvent = { ...event, skipFailureCheck: true };
        mockedTotalRunningExecutions.mockResolvedValue(1);
        mockedPreviousExecutionFailed.mockResolvedValue(true);

        await expect(handler(skipAllowedEvent)).resolves.toEqual({ ...skipAllowedEvent, skipRotation: false });
        expect(mockedTotalRunningExecutions).toHaveBeenCalledWith(event.stepFunctionArn);
        expect(mockedPreviousExecutionFailed).not.toHaveBeenCalled();
    });
});
