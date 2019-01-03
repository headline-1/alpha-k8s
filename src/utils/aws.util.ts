import { EKS, IAM, Route53, STS } from 'aws-sdk';

export const iam = new IAM();
export const route53 = new Route53();
export const sts = new STS();
export const eks = new EKS();
