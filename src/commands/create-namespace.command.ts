import * as k8s from '@kubernetes/client-node';
import { CommandBuilder, Logger, makeDirs, parameters, Types } from '@lpha/core';
import { k8sApi } from '../utils/k8s.util';
import { createNamespaceUser } from './create-namespace-user.command';

const TAG = 'create-namespace';

export const createNamespace = new CommandBuilder()
  .name('create-namespace')
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
  .execute(async ({ namespaceName, clusterName, region }) => {
    if (!namespaceName || !namespaceName.match(/^[a-z][a-z0-9\-]*$/i)) {
      throw new Error(`Namespace name is invalid: ${namespaceName}`);
    }
    const namespacePath = `./namespaces/${namespaceName}`;
    await makeDirs(namespacePath);

    Logger.log(TAG, `Creating namespace "${namespaceName}"...`);
    const namespace = {
      metadata: {
        name: namespaceName,
      },
    } as k8s.V1Namespace;
    await k8sApi.createNamespace(namespace);

    await createNamespaceUser.exec({
      namespaceName,
      clusterName,
      region,
      suffix: 'admin',
      rbacRules: [
        {
          apiGroups: ['', 'extensions', 'apps', 'persistentvolumeclaims', 'storage.k8s.io', 'autoscaling'],
          resources: ['*'],
          verbs: ['*'],
        },
        {
          apiGroups: ['batch'],
          resources: ['jobs', 'cronjobs'],
          verbs: ['*'],
        },
      ],
    });

    await createNamespaceUser.exec({
      namespaceName,
      clusterName,
      region,
      suffix: 'deployments',
      rbacRules: [
        {
          apiGroups: ['extensions', 'apps'],
          resources: ['deployments'],
          verbs: ['*'],
        },
      ],
    });

    return {
      result: undefined,
      revert: async () => void 0,
    };
  })
  .build();
