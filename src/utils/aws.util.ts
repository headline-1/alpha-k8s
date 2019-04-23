import { CloudFormation, EKS, IAM, Route53, STS } from 'aws-sdk';

process.env.AWS_SDK_LOAD_CONFIG = '1';

export const iam = new IAM();
export const route53 = new Route53();
export const sts = new STS();
export const eks = new EKS();
export const cf = new CloudFormation();
