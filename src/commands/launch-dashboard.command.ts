import { getSecret, run } from '../utility';

// @TODO convert to command
const launchDashboard = async () => {
  const adminSecrets = await getSecret('eks-admin');
  console.log(
    'Go to http://localhost:8001/api/v1/namespaces/kube-system/services/https:kubernetes-dashboard:/proxy/#!/login'
  );
  console.log(`---YOUR TOKEN---\n${adminSecrets.token}\n---YOUR TOKEN---`);
  await run('kubectl proxy');
};