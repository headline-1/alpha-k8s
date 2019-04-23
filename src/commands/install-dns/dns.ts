import { CommandBuilder, Logger, parameters, Types } from '@lpha/core';
import * as path from 'path';
import { apply, getDocument } from '../../utility';
import { iam, route53 } from '../../utils/aws.util';

const TAG = 'install-dns';

export const dns = new CommandBuilder()
  .name('install-dns')
  .description('Sets up Route53 binding to cluster')
  .parameters(
    parameters()
      .add('name', {
        type: Types.string,
        required: true,
        description: 'Cluster name',
        cli: 'clusterName',
      })
      .add('domain', {
        type: Types.string,
        required: true,
        description: '',
        cli: 'domain',
      })
      .build()
  )
  .execute(async ({ domain, name }) => {
    const sourceConfigPath = path.resolve(__dirname, 'external-dns.yaml');

    Logger.log(TAG, `Creating Public Hosted Zone "${domain}"...`);
    await route53.createHostedZone({
      CallerReference: `${domain}-$(date +%s)`,
      Name: domain,
    }).promise();

    Logger.log(TAG, 'Preparing ExternalDNS config...');
    const externalDns = await getDocument(sourceConfigPath, { DOMAIN_FILTER: domain });
    await apply(externalDns);

    Logger.log(TAG, 'Listing IAM roles...');
    const { Roles: iamRoles } = await iam.listRoles().promise();
    const roles = iamRoles.filter(role => role.RoleName.startsWith(`eksctl-${name}-nodegroup`));
    if (roles.length !== 1) {
      throw new Error('Expected to get just one role, got: ' + JSON.stringify(roles));
    }

    Logger.log(TAG, 'Putting IAM role policy...');
    await iam.putRolePolicy({
      RoleName: roles[0].RoleName,
      PolicyName: 'external-dns',
      PolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'route53:ChangeResourceRecordSets',
            ],
            Resource: [
              'arn:aws:route53:::hostedzone/*',
            ],
          },
          {
            Effect: 'Allow',
            Action: [
              'route53:ListHostedZones',
              'route53:ListResourceRecordSets',
            ],
            Resource: [
              '*',
            ],
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
