import { CommandBuilder, exec, Logger, parameters, Types } from '@lpha/core';
import { k8sApi, kc } from '../utils/k8s.util';

const TAG = 'launch-dashboard';

export const launchDashboard = new CommandBuilder()
  .name('launch-dashboard')
  .description('Allows dashboard access through a local kubectl proxy')
  .parameters(
    parameters()
      .add('username', {
        type: Types.string,
        required: true,
        description: 'Username used to get the secret token from.',
        default: 'eks-admin',
        cli: 'username',
      })
      .build()
  )
  .execute(async ({ username }) => {
    let token = kc.getCurrentUser().token;
    if (!token) {
      const { body: { items } } = await k8sApi.listNamespacedSecret('kube-system');
      const item = items.find(item => item.metadata.name.includes(username + '-token-'));
      if (!item) {
        throw new Error(`Could not find token for username "${username}".`);
      }
      token = item.data.token;
      if (!token) {
        throw new Error(`There is no "data.token" field in found secret.`);
      }
    }

    Logger.log(TAG,
      'Go to http://localhost:8001/api/v1/namespaces/kube-system/services/https:kubernetes-dashboard:/proxy/#!/login'
    );
    console.log(`---YOUR TOKEN---\n${token}\n---YOUR TOKEN---`);
    await exec('kubectl proxy');
    return {
      result: undefined,
      revert: async () => void 0,
    };
  })
  .build();
