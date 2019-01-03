import { CommandBuilder, Logger, parameters, Types } from '@lpha/core';
import * as YAML from 'js-yaml';
import { iam, sts } from '../utils/aws.util';
import { k8sApi } from '../utils/k8s.util';

export const createAdminUser = new CommandBuilder()
  .name('create-admin-user')
  .description('Creates a new Kubernetes admin user on AWS.')
  .parameters(
    parameters()
      .add('name', {
        type: Types.string,
        description: 'The name of cluster.',
        cli: 'name',
        required: true,
      })
      .build()
  )
  .execute(async ({ name }) => {
    Logger.log(`${name}|AWS`, `Getting AWS Account ID...`);
    const { Account: accountId } = await sts.getCallerIdentity().promise();

    const roleName = `${name}-k8s-admin`;
    const policyName = `${name}-k8s-admin-policy`;

    Logger.log(`${name}|AWS`, `Creating IAM role "${roleName}"... `);

    const { Role: { Arn: roleArn } } = await iam.createRole({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: 'sts:AssumeRole',
            Condition: {},
          },
        ],
      }),
    }).promise();
    Logger.log(`${name}|AWS`, `Created role "${roleName}". ARN: ${roleArn}`);

    Logger.log(`${name}|AWS`, `Creating policy "${policyName}"...`);
    const { Policy: { Arn: policyArn } = { Arn: undefined } } = await iam.createPolicy({
      PolicyName: policyName,
      PolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'AssumeNamespaceRole',
            Effect: 'Allow',
            Action: 'sts:AssumeRole',
            Resource: roleArn,
          },
          {
            Sid: 'ReadonlyEKS',
            Effect: 'Allow',
            Action: [
              'eks:DescribeCluster',
              'eks:ListClusters',
            ],
            Resource: '*',
          },
        ],
      }),
    }).promise();
    if (!policyArn) {
      throw new Error(`Failed to create policy "${policyName}"`);
    }
    Logger.log(`${name}|AWS`, `Created policy "${policyName}". ARN: ${policyArn}`);

    Logger.log(`${name}|K8S`, `Reading AWS Auth configuration and updating "mapRoles" property...`);
    const authConfigMap = (await k8sApi.readNamespacedConfigMap('aws-auth', 'kube-system')).body;
    const roles = YAML.load(authConfigMap.data.mapRoles);
    roles.push({
      groups: ['system:masters'],
      rolearn: roleArn,
      username: roleName,
    });
    authConfigMap.data.mapRoles = YAML.dump(roles);
    await k8sApi.replaceNamespacedConfigMap('aws-auth', 'kube-system', authConfigMap);

    Logger.log(`${name}|AWS`, `Attaching admin policy to current user`);
    const { User: { UserName: currentUserName } } = await iam.getUser({}).promise();
    await iam.attachUserPolicy({
      UserName: currentUserName,
      PolicyArn: policyArn,
    });

    return {
      result: undefined,
      revert: async () => void 0,
    };
  })
  .build();
