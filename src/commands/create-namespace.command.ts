import * as k8s from '@kubernetes/client-node';
import { Config } from '../../config';
import { Module } from '../../module';
import { mkdir } from '../utility';
import { k8sApi } from '../utils/k8s.util';
import { createNamespaceBoundUser } from './create-namespace-user.command';

// @TODO convert to command

export class CreateAppModule extends Module {
  constructor() {
    super('create-namespace');
  }

  async run(config: Config, [namespaceName]: string[]): Promise<void> {
    if (!namespaceName || !namespaceName.match(/^[a-z][a-z0-9\-]*$/i)) {
      throw new Error(`Namespace name is invalid: ${namespaceName}`);
    }
    const namespacePath = `./namespaces/${namespaceName}`;
    await mkdir(namespacePath, { recursive: true });

    console.log(`Creating namespace "${namespaceName}"...`);
    const namespace = {
      metadata: {
        name: namespaceName,
      },
    } as k8s.V1Namespace;
    await k8sApi.createNamespace(namespace);

    await createNamespaceBoundUser(config, namespaceName, 'admin', [
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
    ]);
    await createNamespaceBoundUser(config, namespaceName, 'deployments', [
      {
        apiGroups: ['extensions', 'apps'],
        resources: ['deployments'],
        verbs: ['*'],
      },
    ]);
  }
}
