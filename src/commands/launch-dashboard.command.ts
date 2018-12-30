import { CommandBuilder, exec, Logger, parameters, Types } from '@lpha/core';
import { getSecret } from '../utility';

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
    const adminSecrets = await getSecret(username);
    Logger.log(TAG,
      'Go to http://localhost:8001/api/v1/namespaces/kube-system/services/https:kubernetes-dashboard:/proxy/#!/login'
    );
    console.log(`---YOUR TOKEN---\n${adminSecrets.token}\n---YOUR TOKEN---`);
    await exec('kubectl proxy');
    return {
      result: undefined,
      revert: async () => void 0,
    };
  })
  .build();
