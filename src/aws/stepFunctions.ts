import {ListExecutionsCommand, SFNClient} from "@aws-sdk/client-sfn";

const awsStepFunctions = new SFNClient();

export async function totalRunningExecutions(stepFunctionArn: string): Promise<number> {
    const req = new ListExecutionsCommand({
        stateMachineArn: stepFunctionArn,
        statusFilter: 'RUNNING'
    });

    try {
        const response = await awsStepFunctions.send(req);
        return response.executions.length;
    } catch(err) {
        console.log(err, err.stack, err.statusCode);
        return Promise.reject(err);
    }
}
