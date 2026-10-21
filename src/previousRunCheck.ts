import { previousExecutionFailed, totalRunningExecutions } from './aws/stepFunctions';
import type { PreviousRunCheckInput, PreviousRunCheckResponse } from './utils/handlerInputs';

export async function handler(event: PreviousRunCheckInput): Promise<PreviousRunCheckResponse> {
    const runningExecutions = await totalRunningExecutions(event.stepFunctionArn);

    if (runningExecutions !== 1) {
        console.warn(`Expected to find one running execution (this one!) but there were ${runningExecutions}.`);
        return { ...event, skipRotation: true };
    }

    const failedExecution = await previousExecutionFailed(event.stepFunctionArn);

    if (failedExecution) {
        throw new Error('Previous execution failed; refusing to continue rotation.');
    }

    return { ...event, skipRotation: false };
}
