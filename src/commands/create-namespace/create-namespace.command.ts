import * as k8s from '@kubernetes/client-node';
import { V1DeleteOptions } from '@kubernetes/client-node';
import { CommandBuilder, Logger, makeDir, ParametersBuilder, sleep, Types } from '@lpha/core';
import { StackStatus } from 'aws-sdk/clients/cloudformation';
import { cf } from '../../utils/aws.util';
import { k8sApi } from '../../utils/k8s.util';
import { createKubernetesNamespaceUser } from './create-kubernetes-namespace-user.command';

const TAG = 'create-namespace';

export const createNamespace = new CommandBuilder()
  .name('create-namespace')
  .parameters(
    new ParametersBuilder()
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
      .build()
  )
  .execute(async ({ namespaceName, clusterName }, revertStack) => {
    if (!namespaceName || !namespaceName.match(/^[a-z][a-z0-9\-]*$/i)) {
      throw new Error(`Namespace name is invalid: ${namespaceName}`);
    }
    const namespacePath = `./namespaces/${namespaceName}`;
    await makeDir(namespacePath);

    const StackName = `${namespaceName}-namespace`;
    Logger.log(TAG, `Creating AWS CloudFormation Stack "${StackName}"...`);
    await cf.createStack({
      Capabilities: ['CAPABILITY_IAM', 'CAPABILITY_NAMED_IAM'],
      StackName,
      TemplateBody: JSON.stringify(require('./namespace-cloudformation.json')),
      Parameters: [
        { ParameterKey: 'NamespaceName', ParameterValue: namespaceName },
      ],
    }).promise();
    revertStack.add(async () => {
      Logger.log(TAG, `Removing AWS CloudFormation stack "${StackName}"...`);
      await cf.deleteStack({ StackName }).promise();
      await cf.waitFor('stackDeleteComplete', { StackName }).promise();
    });

    const describeStack = async () => {
      const { Stacks } = await cf.describeStacks({ StackName }).promise();
      if (!Stacks || Stacks.length !== 1) {
        throw new Error(`Can not find exactly one stack for name "${StackName}"`);
      }
      return Stacks[0];
    };

    const getStackStatus = async (): Promise<StackStatus | undefined> => {
      const stack = await describeStack();
      return stack && stack.StackStatus;
    };

    const publishedEventIds: string[] = [];
    while ((await getStackStatus()) === 'CREATE_IN_PROGRESS') {
      const { StackEvents } = await cf.describeStackEvents({ StackName }).promise();
      (StackEvents || [])
        .sort((e1, e2) => e1.Timestamp.getTime() - e2.Timestamp.getTime())
        .filter(e => !publishedEventIds.includes(e.EventId))
        .forEach((e) => {
          publishedEventIds.push(e.EventId);
          const name = Object.entries(JSON.parse(e.ResourceProperties || '{}'))
            .filter(([key, value]) => key && value && key.toLowerCase().includes('name'))
            .map(([, value]) => value)[0];
          const resourceName = name ? `(${name})` : '';
          const statusReason = e.ResourceStatusReason ? ` | ${e.ResourceStatusReason}` : '';

          Logger.log(`${TAG}|CloudFormation`, `${e.ResourceType}${resourceName} | ${e.ResourceStatus}${statusReason}`);
        });
      await sleep(1500);
    }

    const stack = await describeStack();
    if (stack.StackStatus !== 'CREATE_COMPLETE') {
      throw new Error('Unexpected AWS CloudFormation stack creation result.');
    }
    const outputs: Record<string, string> = {};
    for (const { OutputKey, OutputValue } of stack.Outputs || []) {
      if (OutputKey && OutputValue) {
        outputs[OutputKey] = OutputValue;
      }
    }

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

    await createKubernetesNamespaceUser.exec({
      namespaceName,
      clusterName,
      roleArn: outputs.AdminKubernetesRole,
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

    await createKubernetesNamespaceUser.exec({
      namespaceName,
      clusterName,
      roleArn: outputs.DeploymentsKubernetesRole,
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
