import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { props } from './app';
import { ElasticsearchNodeRotation } from './stack';

describe('The generated stack', () => {
	it('matches the snapshot', () => {
		const app = new App();
		const stack = new ElasticsearchNodeRotation(
			app,
			'Elasticsearch-Node-Rotation',
			props,
		);
		const template = Template.fromStack(stack);
		expect(template.toJSON()).toMatchSnapshot();
	});
});
