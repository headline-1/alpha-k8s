import { CommandBuilder, Logger, parameters, readFile, Types } from '@lpha/core';
import * as path from 'path';
import { apply } from '../../utility';
import { iam } from '../../utils/aws.util';

const TAG = 'install-autoscaler';

export const installAutoscaler = new CommandBuilder()
  .name('install-autoscaler')
  .description('Configures Autoscaler for AWS K8S cluster')
  .parameters(
    parameters()
      .add('name', {
        type: Types.string,
        required: true,
        description: 'Cluster name',
        cli: 'clusterName',
      })
      .add('region', {
        type: Types.string,
        required: true,
        description: 'Cluster AWS region',
        cli: 'region',
      })
      .build()
  )
  .execute(async ({ region, name }) => {
    const sourceConfigPath = path.resolve(__dirname, 'cluster-autoscaler-autodiscover.yaml');

    Logger.log(TAG, 'Preparing Autoscaler config...');
    const autoscaler = (await readFile(sourceConfigPath))
      .replace(/\${CLUSTER_REGION}/g, region)
      .replace(/\${CLUSTER_NAME}/g, name);

    Logger.log(TAG, 'Applying Autoscaler file...');
    await apply(autoscaler);

    Logger.log(TAG, 'Listing IAM roles...');
    const { Roles: iamRoles } = await iam.listRoles().promise();
    const roles = iamRoles.filter(role => role.RoleName.startsWith(`eksctl-${name}-nodegroup`));
    if (roles.length !== 1) {
      throw new Error('Expected to get just one role, got: ' + JSON.stringify(roles));
    }

    Logger.log(TAG, 'Putting IAM role policy...');
    await iam.putRolePolicy({
      RoleName: roles[0].RoleName,
      PolicyName: 'cluster-autoscaler',
      PolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'autoscaling:DescribeAutoScalingGroups',
              'autoscaling:DescribeAutoScalingInstances',
              'autoscaling:DescribeTags',
              'autoscaling:SetDesiredCapacity',
              'autoscaling:TerminateInstanceInAutoScalingGroup',
            ],
            Resource: '*',
          },
        ],
      }),
    }).promise();

    return {
      result: undefined,
      revert: async () => void 0,
    };
  })
  .build();
