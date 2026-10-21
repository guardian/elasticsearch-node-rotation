import { ExecutionStatus, ListExecutionsCommand, SFNClient } from '@aws-sdk/client-sfn';

const awsStepFunctions = new SFNClient();

export async function totalRunningExecutions(stepFunctionArn: string): Promise<number> {
    const req = new ListExecutionsCommand({
        stateMachineArn: stepFunctionArn,
        statusFilter: ExecutionStatus.RUNNING,
    });

    try {
        const response = await awsStepFunctions.send(req);
        return response.executions.length;
    } catch (error) {
        console.log(error);
        throw error;
    }
}

export async function previousExecutionFailed(stepFunctionArn: string): Promise<boolean> {
    const req = new ListExecutionsCommand({
        stateMachineArn: stepFunctionArn,
        maxResults: 2,
    });

    try {
        const response = await awsStepFunctions.send(req);
        return response.executions.some(execution => execution.status === ExecutionStatus.FAILED);
    } catch (error) {
        console.log(error);
        throw error;
    }
}
