import { V1beta1Role, V1beta1RoleBinding, V1DeleteOptions } from '@kubernetes/client-node';
import { CommandBuilder, Logger, parameters, Types, writeFile } from '@lpha/core';
import * as YAML from 'js-yaml';
import { iam, sts } from '../utils/aws.util';
import { k8sApi, k8sRbacApi, kc } from '../utils/k8s.util';

const TAG = 'CreateNamespaceUser';

export const createNamespaceUser = new CommandBuilder()
  .name('create-namespace-user')
  .description(
    'Creates a new user, role and policy in specified cluster\'s namespace. ' +
    'After completion, you will be able to access cluster in namespace\'s scope using AWS IAM Authernticator. ' +
    'New AWS credentials and Kubeconfig file will be generated automatically.'
  )
  .parameters(
    parameters()
      .add('clusterName', {
        type: Types.string,
        required: true,
        description: 'The name of K8S cluster',
      })
      .add('namespaceName', {
        type: Types.string,
        required: true,
        description: 'The name of K8S cluster\'s namespace',
      })
      .add('suffix', {
        type: Types.string,
        required: true,
        description: 'Part of all user name roles, policies and other resources' +
          ' uniquely identifying user in the namespace.',
      })
      .add('region', {
        type: Types.string,
        required: true,
        description: 'Cluster AWS region',
      })
      .add('rbacRules', {
        type: Types.array(Types.partial({
          apiGroups: Types.array(Types.string),
          nonResourceURLs: Types.array(Types.string),
          resourceNames: Types.array(Types.string),
          resources: Types.array(Types.string),
          verbs: Types.array(Types.string),
        })),
        required: true,
        description: 'Role Based Access Control rules for the new role',
      })
      .build()
  )
  .execute(async ({ clusterName, namespaceName, suffix, region, rbacRules }, revertStack) => {
    const kubernetesName = `${namespaceName}-${suffix}`;
    const name = `${kubernetesName}-${clusterName}`;
    const userName = `${name}-k8s-user`;
    const kubernetesGroupName = `${kubernetesName}-group`;
    const kubernetesRoleName = `${kubernetesName}-role`;
    const kubernetesRoleBindingName = `${kubernetesName}-role-binding`;
    const roleName = `${name}-k8s-role`;
    const policyName = `${name}-k8s-policy`;

    Logger.log(TAG, `Creating ${suffix} user for namespace ${namespaceName}...`);

    Logger.log(`${name}|AWS`, `Getting AWS Account ID...`);
    const { Account: accountId } = await sts.getCallerIdentity().promise();

    Logger.log(`${name}|K8S`, `Creating namespaced role "${kubernetesRoleName}" for namespace "${namespaceName}"...`);
    await k8sRbacApi().createNamespacedRole(namespaceName, {
      kind: 'Role',
      apiVersion: 'rbac.authorization.k8s.io/v1beta1',
      metadata: {
        name: kubernetesRoleName,
        namespace: namespaceName,
      },
      rules: rbacRules,
    } as V1beta1Role);
    revertStack.add(async () => {
      Logger.log(
        `${name}|K8S`,
        `Deleting namespaced role "${kubernetesRoleName}" for namespace "${namespaceName}"...`
      );
      await k8sRbacApi().deleteNamespacedRole(kubernetesRoleName, namespaceName, {
        propagationPolicy: 'Foreground',
      } as V1DeleteOptions);
    });

    Logger.log(
      `${name}|K8S`,
      `Creating namespaced role binding "${kubernetesRoleBindingName}" for namespace "${namespaceName}"...`
    );
    await k8sRbacApi().createNamespacedRoleBinding(namespaceName, {
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
          namespace: namespaceName,
        },
      ],
      roleRef: {
        apiGroup: 'rbac.authorization.k8s.io',
        kind: 'Role',
        name: kubernetesRoleName,
      },
    } as V1beta1RoleBinding);
    revertStack.add(async () => {
      Logger.log(
        `${name}|K8S`,
        `Deleting namespaced role binding "${kubernetesRoleBindingName}" for namespace "${namespaceName}"...`
      );
      await k8sRbacApi().deleteNamespacedRoleBinding(kubernetesRoleBindingName, namespaceName, {
        propagationPolicy: 'Foreground',
      } as V1DeleteOptions);
    });

    Logger.log(`${name}|AWS`, `Creating IAM role "${roleName}"...`);
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
    revertStack.add(async () => {
      Logger.log(`${name}|AWS`, `Deleting IAM role "${roleName}"...`);
      await iam.deleteRole({
        RoleName: roleName,
      }).promise();
    });

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
        ],
      }),
    }).promise();

    if (!policyArn) {
      throw new Error('"policyArn" is missing');
    }

    revertStack.add(async () => {
      Logger.log(`${name}|AWS`, `Deleting policy "${policyArn}"...`);
      await iam.deletePolicy({
        PolicyArn: policyArn,
      }).promise();
    });

    Logger.log(`${name}|AWS`, `Creating user "${userName}"...`);
    const { User: { Arn: userArn } = { Arn: undefined } } = await iam.createUser({
      UserName: userName,
    }).promise();

    if (!userArn) {
      throw new Error('"userArn" is missing');
    }

    revertStack.add(async () => {
      Logger.log(`${name}|AWS`, `Deleting user "${userName}"...`);
      await iam.deleteUser({
        UserName: userName,
      }).promise();
    });

    Logger.log(`${name}|AWS`, `Attaching policy "${policyArn}" to the user "${userName}"...`);
    await iam.attachUserPolicy({
      UserName: userName,
      PolicyArn: policyArn,
    }).promise();
    revertStack.add(async () => {
      await iam.detachUserPolicy({
        UserName: userName,
        PolicyArn: policyArn,
      }).promise();
    });

    Logger.log(`${name}|AWS`, `Allowing user "${userArn}" to access role ${roleName}...`);
    const { Role: { AssumeRolePolicyDocument: assumeRolePolicy = undefined } = {} } = await iam.getRole({
      RoleName: roleName,
    }).promise();

    if (!assumeRolePolicy) {
      throw new Error('"assumeRolePolicy" is missing');
    }

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

    Logger.log(`${name}|K8S`, `Reading AWS Auth configuration and updating "mapRoles" property...`);
    const authConfigMap = (await k8sApi().readNamespacedConfigMap('aws-auth', 'kube-system')).body;
    const roles = YAML.load(authConfigMap.data.mapRoles);
    roles.push({
      groups: [kubernetesGroupName],
      rolearn: roleArn,
      username: kubernetesName,
    });
    authConfigMap.data.mapRoles = YAML.dump(roles);
    await k8sApi().replaceNamespacedConfigMap('aws-auth', 'kube-system', authConfigMap);

    revertStack.add(async () => {
      const authConfigMap = (await k8sApi().readNamespacedConfigMap('aws-auth', 'kube-system')).body;
      const roles = YAML.load(authConfigMap.data.mapRoles)
        .filter((role: any) => role.rolearn !== roleArn);
      authConfigMap.data.mapRoles = YAML.dump(roles);
      await k8sApi().replaceNamespacedConfigMap('aws-auth', 'kube-system', authConfigMap);
    });

    Logger.log(`${name}|K8S`, `Saving ${suffix} yaml and base64-encoded configurations.`);
    const clusterItem = kc.clusters.find(c => c.name.startsWith(`${clusterName}.${region}`));
    if (!clusterItem) {
      throw new Error(`Could not find a cluster starting with "${clusterName}.${region}"`);
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
                '-i', clusterName,
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
      userConfig
    );
    await writeFile(
      `./namespaces/${namespaceName}/${suffix}.config.base64.txt`,
      Buffer.from(userConfig).toString('base64')
    );

    Logger.log(`${name}|AWS`, `Creating access keys for ${suffix} user.`);
    const { AccessKey } = await iam.createAccessKey({
      UserName: userName,
    }).promise();
    await writeFile(
      `./namespaces/${namespaceName}/${suffix}.keys.json`,
      JSON.stringify(AccessKey, null, 2)
    );
    Logger.log(TAG, `${name}: Done!`);
    return userArn;
  })
  .build();
