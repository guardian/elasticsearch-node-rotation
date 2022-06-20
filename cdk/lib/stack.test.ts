import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { MyStack } from './stack';

describe('The IntegrationTest stack', () => {
	it('matches the snapshot', () => {
		const app = new App();
		const stack = new MyStack(app, 'IntegrationTest', {
			stack: 'cdk',
			stage: 'TEST',
		});
		const template = Template.fromStack(stack);
		expect(template.toJSON()).toMatchSnapshot();
	});
});
