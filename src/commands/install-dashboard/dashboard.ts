import { CommandBuilder, Logger } from '@lpha/core';
import * as YAML from 'js-yaml';
import { apply, applyFiles } from '../../utility';

const TAG = 'install-dashboard';

export const installDashboard = new CommandBuilder()
  .name('install-dashboard')
  .description('Installs dashboard and configures default eks-admin account to access it')
  .execute(async () => {
    Logger.log(TAG, 'Applying Dashboard files...');
    await applyFiles([
      'https://raw.githubusercontent.com/kubernetes/dashboard/v1.10.1/src/deploy/recommended/kubernetes-dashboard.yaml',
      'https://raw.githubusercontent.com/kubernetes/heapster/master/deploy/kube-config/influxdb/heapster.yaml',
      'https://raw.githubusercontent.com/kubernetes/heapster/master/deploy/kube-config/influxdb/influxdb.yaml',
      'https://raw.githubusercontent.com/kubernetes/heapster/master/deploy/kube-config/rbac/heapster-rbac.yaml',
    ]);

    Logger.log(TAG, 'Adding eks-admin role...');
    await apply(
      YAML.dump({
        apiVersion: 'v1',
        kind: 'ServiceAccount',
        metadata: {
          name: 'eks-admin',
          namespace: 'kube-system',
        },
      }) +
      '\n---\n' +
      YAML.dump({
          apiVersion: 'rbac.authorization.k8s.io/v1beta1',
          kind: 'ClusterRoleBinding',
          metadata: {
            name: 'eks-admin',
          },
          roleRef: {
            apiGroup: 'rbac.authorization.k8s.io',
            kind: 'ClusterRole',
            name: 'cluster-admin',
          },
          subjects: [
            {
              kind: 'ServiceAccount',
              name: 'eks-admin',
              namespace: 'kube-system',
            },
          ],
        }
      )
    );
    return {
      result: undefined,
      revert: async () => void 0,
    };
  })
  .build();
