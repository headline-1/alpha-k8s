import * as k8s from '@kubernetes/client-node';
import { V1DeleteOptions } from '@kubernetes/client-node';
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
        cli: 'clusterName',
      })
      .add('namespaceName', {
        type: Types.string,
        required: true,
        description: 'The name of K8S cluster\'s namespace',
        cli: 'namespaceName',
      })
      .add('region', {
        type: Types.string,
        required: true,
        description: 'Cluster AWS region',
        cli: 'region',
      })
      .build()
  )
  .execute(async ({ namespaceName, clusterName, region }, revertStack) => {
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
    await k8sApi().createNamespace(namespace);
    revertStack.add(async () => {
      Logger.log(TAG, `Deleting namespace "${namespaceName}"...`);
      await k8sApi().deleteNamespace(namespaceName, {
        propagationPolicy: 'Foreground',
      } as V1DeleteOptions);
    });

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
    }, revertStack);

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
    }, revertStack);
  })
  .build();
