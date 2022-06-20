import { App } from 'aws-cdk-lib';
import { MyStack } from './stack';

// Use this file to instantiate your stacks.

const app = new App();

new MyStack(app, 'MyStack-CODE', {
	stack: 'FIXME',
	stage: 'CODE',
});

new MyStack(app, 'MyStack-PROD', {
	stack: 'FIXME',
	stage: 'PROD',
});
