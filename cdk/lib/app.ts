import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { App } from 'aws-cdk-lib';
import { ElasticsearchNodeRotation } from './stack';

const app = new App();

export const props: GuStackProps = {
	stack: 'elasticsearch-node-rotation',
	stage: 'INFRA',
};

new ElasticsearchNodeRotation(app, 'Elasticsearch-Node-Rotation', props);
