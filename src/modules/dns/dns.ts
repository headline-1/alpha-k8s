import * as path from 'path';
import { iam, route53 } from '../../utils/aws.util';
import { Config } from '../../config';
import { Module } from '../../module';
import { applyFile, getDocument, writeFile } from '../../utility';

export const dns = async (config: Config) => {
  if (!config.domain) {
    throw new Error('"domain" field is missing in config');
  }

  const sourceConfigPath = path.resolve(__dirname, 'external-dns.yaml');
  const configPath = path.resolve(__dirname, 'external-dns.filled.yaml');

  console.log(`Creating Public Hosted Zone "${config.domain}"...`);
  await route53.createHostedZone({
    CallerReference: `${config.domain}-$(date +%s)`,
    Name: config.domain,
  }).promise();

  console.log('Preparing ExternalDNS config...');
  const externalDns = await getDocument(sourceConfigPath, { DOMAIN_FILTER: config.domain });
  await writeFile(configPath, externalDns, { encoding: 'utf8' });
  await applyFile(configPath);

  console.log('Listing IAM roles...');
  const { Roles: iamRoles } = await iam.listRoles().promise();
  const roles = iamRoles.filter(role => role.RoleName.startsWith(`eksctl-${config.name}-nodegroup`));
  if (roles.length !== 1) {
    throw new Error('Expected to get just one role, got: ' + JSON.stringify(roles));
  }

  console.log('Putting IAM role policy...');
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
};
