const { GuCDKTypescriptProject } = require("@guardian/cdk-app-ts");
const { DependencyType } = require("projen");
const project = new GuCDKTypescriptProject({
});
project.deps.addDependency("@guardian/cdk-app-ts@0.1.9", DependencyType.BUILD)
project.synth();