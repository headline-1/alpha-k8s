import { V1beta1PolicyRule } from '@kubernetes/client-node';
import { STS } from 'aws-sdk';
import * as YAML from 'js-yaml';
import { iam } from '../utils/aws.util';
import { Config } from '../../config';
import { k8sApi, kc } from '../utils/k8s.util';
import { run, writeFile } from '../utility';

// @TODO convert to command

export const createNamespaceBoundUser = async (
  config: Config, namespaceName: string, suffix: string, rbacRules: Partial<V1beta1PolicyRule>[]
) => {
  const kubernetesName = `${namespaceName}-${suffix}`;
  const name = `${kubernetesName}-${config.name}`;
  const userName = `${name}-k8s-user`;
  const kubernetesGroupName = `${kubernetesName}-group`;
  const kubernetesRoleName = `${kubernetesName}-role`;
  const kubernetesRoleBindingName = `${kubernetesName}-role-binding`;
  const roleName = `${name}-k8s-role`;
  const policyName = `${name}-k8s-policy`;

  const revertActions: Array<() => Promise<void>> = [];

  console.log(`Creating ${suffix} user for namespace ${namespaceName}...`);

  console.log(`${name}|AWS: Getting AWS Account ID...`);
  const { Account: accountId } = await new STS().getCallerIdentity().promise();

  try {
    console.log(`${name}|K8S: Creating role binding...`);
    const kubernetesRole = YAML.dump({
      kind: 'Role',
      apiVersion: 'rbac.authorization.k8s.io/v1beta1',
      metadata: {
        name: kubernetesRoleName,
        namespace: namespaceName,
      },
      rules: rbacRules,
    });
    const kubernetesRoleBinding = YAML.dump({
      kind: 'RoleBinding',
      apiVersion: 'rbac.authorization.k8s.io/v1beta1',
      metadata: {
        name: kubernetesRoleBindingName,
        namespace: namespaceName,
      },
      subjects: [
        {
          kind: 'Group',
          name: kubernetesGroupName,
        },
      ],
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name: kubernetesRoleName,
      },
    });
    const kubernetesRolePath = `./namespaces/${namespaceName}/roles`;
    await writeFile(kubernetesRolePath, `${kubernetesRole}\n---\n${kubernetesRoleBinding}`);
    await run(`kubectl apply -f ${kubernetesRolePath}`);

    console.log(`${name}|AWS: Creating IAM role "${roleName}"...`);

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
    revertActions.unshift(async () => {
      console.log(`${name}|AWS: Deleting IAM role "${roleName}"...`);
      await iam.deleteRole({
        RoleName: roleName,
      }).promise();
    });

    console.log(`${name}|AWS: Creating policy "${policyName}"...`);
    const { Policy: { Arn: policyArn } } = await iam.createPolicy({
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
        ],
      }),
    }).promise();
    revertActions.unshift(async () => {
      console.log(`${name}|AWS: Deleting policy "${policyArn}"...`);
      await iam.deletePolicy({
        PolicyArn: policyArn,
      }).promise();
    });

    console.log(`${name}|AWS: Creating user "${userName}"...`);
    const { User: { Arn: userArn } } = await iam.createUser({
      UserName: userName,
    }).promise();
    revertActions.unshift(async () => {
      console.log(`${name}|AWS: Deleting user "${userName}"...`);
      await iam.deleteUser({
        UserName: userName,
      }).promise();
    });

    console.log(`${name}|AWS: Attaching policy "${policyArn}" to the user "${userName}"...`);
    await iam.attachUserPolicy({
      UserName: userName,
      PolicyArn: policyArn,
    }).promise();

    console.log(`${name}|AWS: Allowing user "${userArn}" to access role ${roleName}...`);
    const { Role: { AssumeRolePolicyDocument: assumeRolePolicy } } = await iam.getRole({
      RoleName: roleName,
    }).promise();
    const assumeRolePolicyObject = JSON.parse(decodeURIComponent(assumeRolePolicy));
    const principal = assumeRolePolicyObject.Statement[0].Principal;
    if (typeof principal.AWS === 'string') {
      principal.AWS = [principal.AWS];
    }
    principal.AWS.push(userArn);
    await iam.updateAssumeRolePolicy({
      RoleName: roleName,
      PolicyDocument: JSON.stringify(assumeRolePolicyObject),
    });
    console.log(`${name}|K8S: Reading AWS Auth configuration and updating "mapRoles" property...`);
    const authConfigMap = (await k8sApi.readNamespacedConfigMap('aws-auth', 'kube-system')).body;
    const roles = YAML.load(authConfigMap.data.mapRoles);
    roles.push({
      groups: [kubernetesGroupName],
      rolearn: roleArn,
      username: kubernetesName,
    });
    authConfigMap.data.mapRoles = YAML.dump(roles);
    await k8sApi.replaceNamespacedConfigMap('aws-auth', 'kube-system', authConfigMap);

    console.log(`${name}|K8S: Saving ${suffix} yaml and base64-encoded configurations.`);
    const clusterItem = kc.clusters.find(c => c.name.startsWith(`${config.name}.${config.region}`));
    if (!clusterItem) {
      throw new Error(`Could not find a cluster starting with "${config.name}.${config.region}"`);
    }

    const userConfig = YAML.dump({
      apiVersion: 'v1',
      kind: 'Config',
      preferences: {},
      clusters: [
        {
          name: clusterItem.name,
          cluster: {
            'certificate-authority-data': clusterItem.caData,
            server: clusterItem.server,
          },
        },
      ],
      users: [
        {
          name: userName,
          user: {
            exec: {
              apiVersion: 'client.authentication.k8s.io/v1alpha1',
              args: [
                'token',
                '-i', config.name,
                '-r', roleArn,
              ],
              command: 'aws-iam-authenticator',
              env: null,
            },
          },
        },
      ],
      contexts: [
        {
          context: {
            cluster: clusterItem.name,
            namespace: namespaceName,
            user: userName,
          },
          name: kubernetesName,
        },
      ],
      'current-context': kubernetesName,
    });

    await writeFile(
      `./namespaces/${namespaceName}/${suffix}.config.yaml`,
      userConfig,
      { encoding: 'utf8' }
    );
    await writeFile(
      `./namespaces/${namespaceName}/${suffix}.config.base64.txt`,
      Buffer.from(userConfig).toString('base64'),
      { encoding: 'utf8' }
    );

    console.log(`${name}|AWS: Creating access keys for ${suffix} user.`);
    const { AccessKey } = await iam.createAccessKey({
      UserName: userName,
    }).promise();
    await writeFile(
      `./namespaces/${namespaceName}/${suffix}.keys.json`,
      JSON.stringify(AccessKey, null, 2),
      { encoding: 'utf8' }
    );
    console.log(`${name}: Done!`);
    return userArn;
  } catch (error) {
    console.error(error);
    console.log('Reverting all actions, because the error occurred in the middle of create user operation.');
    for (const action of revertActions) {
      await action();
    }
  }
  throw new Error();
};
