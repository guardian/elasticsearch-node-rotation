import { App } from 'aws-cdk-lib';
import { ElasticsearchNodeRotation } from './stack';
import {GuStackProps} from "@guardian/cdk/lib/constructs/core";

const app = new App();

export const props: GuStackProps = {
	stack: "elasticsearch-node-rotation",
	stage: "INFRA",
}

new ElasticsearchNodeRotation(app, "Elasticsearch-Node-Rotation", props);
