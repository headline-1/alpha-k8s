import * as k8s from '@kubernetes/client-node';

export const kc = new k8s.KubeConfig();
kc.loadFromDefault();
export const k8sApi = kc.makeApiClient(k8s.Core_v1Api);
