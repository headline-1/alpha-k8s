import * as path from 'path';
import { iam } from '../../utils/aws.util';
import { Config } from '../../config';
import { Module } from '../../module';
import { applyFile, readFile, writeFile } from '../../utility';

export const autoscaler = async (config: Config) => {
  const sourceConfigPath = path.resolve(__dirname, 'cluster-autoscaler-autodiscover.yaml');
  const filledConfigPath = path.resolve(__dirname, 'cluster-autoscaler-autodiscover.filled.yaml');

  console.log('Preparing Autoscaler config...');
  const autoscaler = (await readFile(sourceConfigPath, { encoding: 'utf8' }))
    .replace(/\${CLUSTER_REGION}/g, config.region)
    .replace(/\${CLUSTER_NAME}/g, config.name);
  await writeFile(filledConfigPath, autoscaler, { encoding: 'utf8' });

  console.log('Applying Autoscaler file...');
  await applyFile(filledConfigPath);

  console.log('Listing IAM roles...');
  const { Roles: iamRoles } = await iam.listRoles().promise();
  const roles = iamRoles.filter(role => role.RoleName.startsWith(`eksctl-${config.name}-nodegroup`));
  if (roles.length !== 1) {
    throw new Error('Expected to get just one role, got: ' + JSON.stringify(roles));
  }

  console.log('Putting IAM role policy...');
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
};
