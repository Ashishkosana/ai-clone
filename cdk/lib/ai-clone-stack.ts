import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as path from "path";

/**
 * Ashish's AI Clone — serverless backend.
 *
 * API Gateway -> Lambda (Python):
 *   POST /lead    create lead + send email/SMS codes
 *   POST /verify  check code (5-min expiry) -> session token
 *   POST /chat    verified-only; persona + Claude proxy
 *   GET  /admin/stats  admin-auth; lead/convo/message counts
 *
 * Data: one DynamoDB table (leads · conversations · messages), GSI1 by entity.
 */
export class AiCloneStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const sesFromEmail = this.node.tryGetContext("sesFromEmail") as string;
    const adminEmail = this.node.tryGetContext("adminEmail") as string;
    const smsEnabled = String(this.node.tryGetContext("smsEnabled")) === "true";

    // --- Data -----------------------------------------------------------
    const table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
    });
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "entity", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });

    // --- Secrets --------------------------------------------------------
    // Populate after deploy: { "claudeApiKey": "...", "sessionSecret": "...",
    //   "adminToken": "...", "twilioSid": "...", "twilioAuthToken": "...",
    //   "twilioFrom": "..." }
    const secret = new secrets.Secret(this, "Secrets", {
      secretName: "ai-clone/secrets",
      description: "Claude API key, session/admin secrets, Twilio creds",
    });

    // --- Lambda shared config ------------------------------------------
    const commonEnv: Record<string, string> = {
      TABLE_NAME: table.tableName,
      SECRET_ARN: secret.secretArn,
      SES_FROM_EMAIL: sesFromEmail,
      SMS_ENABLED: smsEnabled ? "true" : "false",
      CODE_TTL_SECONDS: "300",
      // LLM provider — "gemini" (free) now; flip to "claude" once you have credits.
      LLM_PROVIDER: (this.node.tryGetContext("llmProvider") as string) || "gemini",
    };

    const mkFn = (name: string, dir: string, timeout = 10, mem = 256) => {
      const fn = new lambda.Function(this, name, {
        runtime: lambda.Runtime.PYTHON_3_13,
        handler: "handler.main",
        code: lambda.Code.fromAsset(path.join(__dirname, "..", "lambdas", dir)),
        environment: commonEnv,
        timeout: cdk.Duration.seconds(timeout),
        memorySize: mem,
        architecture: lambda.Architecture.ARM_64,
      });
      table.grantReadWriteData(fn);
      secret.grantRead(fn);
      return fn;
    };

    const leadFn = mkFn("LeadFn", "lead");
    const chatFn = mkFn("ChatFn", "chat", 30, 512); // LLM call
    const adminFn = mkFn("AdminFn", "admin");

    // --- API ------------------------------------------------------------
    const api = new apigw.RestApi(this, "Api", {
      restApiName: "ai-clone-api",
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
      },
      deployOptions: {
        throttlingRateLimit: 20,
        throttlingBurstLimit: 40,
      },
    });

    const post = (res: apigw.Resource, fn: lambda.Function) =>
      res.addMethod("POST", new apigw.LambdaIntegration(fn));

    post(api.root.addResource("lead"), leadFn);
    post(api.root.addResource("chat"), chatFn);
    api.root
      .addResource("admin")
      .addResource("stats")
      .addMethod("GET", new apigw.LambdaIntegration(adminFn));

    // --- Static hosting (S3 + CloudFront) -------------------------------
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, "Site", {
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin:
          origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    });

    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [s3deploy.Source.asset(path.join(__dirname, "..", "..", "web"))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
    });

    // --- Outputs --------------------------------------------------------
    new cdk.CfnOutput(this, "SiteUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
    new cdk.CfnOutput(this, "SecretArn", { value: secret.secretArn });
    new cdk.CfnOutput(this, "AdminEmail", { value: adminEmail || "(unset)" });
  }
}
