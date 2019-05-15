import { V1beta1Role, V1beta1RoleBinding, V1DeleteOptions } from '@kubernetes/client-node';
import { CommandBuilder, Logger, ParametersBuilder, Types } from '@lpha/core';
import * as YAML from 'js-yaml';
import { k8sApi, k8sRbacApi } from '../../utils/k8s.util';

const TAG = 'CreateK8sNamespaceUser';

export const createKubernetesNamespaceUser = new CommandBuilder()
  .name('create-k8s-namespace-user')
  .description(
    'Creates a new IAM group and user, role and policy in specified cluster\'s namespace. ' +
    'After completion, you will be able to access cluster in namespace\'s scope using AWS IAM Authenticator. ' +
    'New AWS credentials will be generated automatically.'
  )
  .parameters(
    new ParametersBuilder()
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
      .add('roleArn', {
        type: Types.string,
        required: true,
        description: 'AWS role ARN that will be allowed to use namespace resources',
      })
      .add('suffix', {
        type: Types.string,
        required: true,
        description: 'Part of all user name roles, policies and other resources' +
          ' uniquely identifying user in the namespace.',
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
  .execute(async ({ clusterName, namespaceName, suffix, rbacRules }, revertStack) => {
    const kubernetesName = `${namespaceName}-${suffix}`;
    const name = `${kubernetesName}-${clusterName}`;
    const kubernetesGroupName = `${kubernetesName}-group`;
    const kubernetesRoleName = `${kubernetesName}-role`;
    const kubernetesRoleBindingName = `${kubernetesName}-role-binding`;
    const roleArn = `${name}-k8s-role`;

    Logger.log(TAG, `Creating ${suffix} user for namespace ${namespaceName}...`);

    Logger.log(`${name}|AWS`, `Getting AWS Account ID...`);

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
      await k8sRbacApi().deleteNamespacedRole(kubernetesRoleName, namespaceName, undefined, {
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
      await k8sRbacApi().deleteNamespacedRoleBinding(kubernetesRoleBindingName, namespaceName, undefined, {
        propagationPolicy: 'Foreground',
      } as V1DeleteOptions);
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
  })
  .build();
