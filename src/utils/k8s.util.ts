import * as k8s from '@kubernetes/client-node';
import { KubeConfig } from '@kubernetes/client-node';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import * as YAML from 'js-yaml';
import * as path from 'path';

export const kc = new k8s.KubeConfig();

const readDefaultConfigFromFile = (): string | undefined => {
  if (process.env.KUBECONFIG && process.env.KUBECONFIG.length > 0) {
    return fs.readFileSync(process.env.KUBECONFIG, { encoding: 'utf8' });
  }
  const home = KubeConfig.findHomeDir();
  if (home) {
    const config = path.join(home, '.kube', 'config');
    if (fs.existsSync(config)) {
      return fs.readFileSync(config, { encoding: 'utf8' });
    }
  }
  return undefined;
};

export const initKubeConfig = () => {
  const configString = readDefaultConfigFromFile();
  if (!configString) {
    kc.loadFromDefault();
    return;
  }
  const config = YAML.load(configString);
  if (config.users) {
    for (const user of config.users) {
      const exec = user.user.exec;
      if (exec) {
        const result = childProcess.spawnSync(exec.command, exec.args, { encoding: 'utf8' });
        if (exec.apiVersion === 'client.authentication.k8s.io/v1alpha1') {
          const authResult = JSON.parse(result.stdout);
          if (authResult.status && authResult.status.token) {
            user.user.token = authResult.status.token;
          }
        }
      }
    }
  }
  const authProviderConfigString = YAML.dump(config);
  kc.loadFromString(authProviderConfigString);
};

initKubeConfig();

export const k8sApi = kc.makeApiClient(k8s.Core_v1Api);
export const k8sRbacApi = kc.makeApiClient(k8s.RbacAuthorization_v1beta1Api);
