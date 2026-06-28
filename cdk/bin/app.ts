#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { AiCloneStack } from "../lib/ai-clone-stack";

const app = new cdk.App();

new AiCloneStack(app, "AiCloneStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "us-east-1",
  },
  description: "Ashish's AI Clone — chat-first personal site backend",
});
