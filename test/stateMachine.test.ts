import { readFileSync } from 'fs';
import { join } from 'path';

it('checkpoints confirmed removal before independently resumable settings cleanup', () => {
    const template = readFileSync(join(__dirname, '../cloudformation.yaml'), 'utf8');
    const definition = template.match(/          - \|\n([\s\S]*?)\n          -\n/)![1];
    const workflow = JSON.parse(definition.replace('${ClusterSizeCheckAttempts}', '60'));
    expect(workflow.States.RemoveNode).toEqual({
        Type: 'Task', Resource: '${RemoveNodeArn}', Next: 'RestoreClusterSettings',
    });
    expect(workflow.States.RestoreClusterSettings).toEqual({
        Type: 'Task', Resource: '${RestoreClusterSettingsArn}', End: true,
    });
    expect(template).toContain('RestoreClusterSettingsArn: !GetAtt RestoreClusterSettingsLambda.Arn');
    expect(template).toContain('Handler: "restoreClusterSettings.handler"');
    const deployment = readFileSync(join(__dirname, '../riff-raff.yaml'), 'utf8');
    expect(deployment).toContain('- -enr-restore-cluster-settings-');
});
