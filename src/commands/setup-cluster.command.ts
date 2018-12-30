import { CommandBuilder, exec, parameters, Types } from '@lpha/core';
import { createKeyPair } from '../utility';

export const setupCluster = new CommandBuilder()
  .name('setup-cluster')
  .description('Creates a new Kubernetes cluster on AWS.')
  .parameters(
    parameters()
      .add('name', {
        type: Types.string,
        description: 'The name of cluster you\'d like to create.',
        cli: 'name',
        required: true,
      })
      .add('region', {
        type: Types.string,
        description: 'The region where the cluster will be created, i.e. eu-west-1',
        cli: 'region',
        env: 'AWS_DEFAULT_REGION',
        required: true,
      })
      .add('nodesMin', {
        type: Types.number,
        description: 'The minimal number of nodes present in the cluster.',
        default: 2,
        cli: 'nodesMin',
        required: true,
      })
      .add('nodesMax', {
        type: Types.number,
        description: 'The maximal number of nodes present in the cluster.',
        default: 5,
        cli: 'nodesMax',
        required: true,
      })
      .add('sshKey', {
        type: Types.string,
        description: 'Path to the SSH key that may be used to access cluster',
        default: './cluster_key',
        cli: 'sshKey',
        required: true,
      })
      .build()
  )
  .execute(async ({ name, nodesMax, nodesMin, region, sshKey }) => {
    await createKeyPair(sshKey, 'admin@' + name);
    const sshPublicKey = sshKey + '.pub';

    await exec(`eksctl create cluster
      --name=${name}
      --region=${region}
      --node-private-networking
      --nodes-min=${nodesMin}
      --nodes-max=${nodesMax}
      --ssh-access
      --ssh-public-key=${sshPublicKey}
    `.replace(/\n/g, ''));

    return {
      result: undefined,
      revert: async () => void 0,
    };
  })
  .build();
