import * as path from 'path';
import { Config } from '../../config';
import { Module } from '../../module';
import { applyFiles } from '../../utility';

export const dashboard = async (_: Config) => {
  console.log('Applying Dashboard files...');
  await applyFiles([
    'https://raw.githubusercontent.com/kubernetes/dashboard/v1.10.1/src/deploy/recommended/kubernetes-dashboard.yaml',
    'https://raw.githubusercontent.com/kubernetes/heapster/master/deploy/kube-config/influxdb/heapster.yaml',
    'https://raw.githubusercontent.com/kubernetes/heapster/master/deploy/kube-config/influxdb/influxdb.yaml',
    'https://raw.githubusercontent.com/kubernetes/heapster/master/deploy/kube-config/rbac/heapster-rbac.yaml',
    path.resolve(__dirname, './eks-admin-service-account.yaml'),
  ]);
};
