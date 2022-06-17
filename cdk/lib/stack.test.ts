import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ElasticsearchNodeRotation } from './stack';
import {props} from "./app";

describe('The generated stack', () => {
	it('matches the snapshot', () => {
		const app = new App();
		const stack = new ElasticsearchNodeRotation(app, "Elasticsearch-Node-Rotation", props);
		const template = Template.fromStack(stack);
		expect(template.toJSON()).toMatchSnapshot();
	});
});
