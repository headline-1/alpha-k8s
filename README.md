# @lpha/plugin-aws-k8s
Utility that simplifies Kubernetes@AWS cluster management

### How to cluster

1. Download & install a lot of dependencies (sorry for that):
   * [aws-cli](https://aws.amazon.com/cli/)
   * [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)
   * [eksctl](https://eksctl.io)
   * [aws-iam-authenticator](https://docs.aws.amazon.com/eks/latest/userguide/configure-kubectl.html)
   * [Node.js](https://nodejs.org/) & Yarn (`npm i -g yarn`)
   * alpha-k8s (for now, just [download the repo](https://github.com/headline-1/alpha-k8s/archive/master.zip) and run `yarn`, btw you'll need Node.js and Yarn - that's a lot of deps, sorry!)
2. Create cluster config file `kube.json`
    ```json
    {
      "name": "h1-eks",
      "region": "eu-west-1",
      "nodesMin": 2,
      "nodesMax": 5,
      "domain": "h1.com"
    }
    ```
3. Set correct AWS credentials with `aws configure`
4. Run `yarn setup`. Wait 5-15 minutes. Eksctl will do it's magic.
5. Optionally, run `yarn start install [module1] [module2]` if you want to install things such as "dashboard", "autoscaler", "dns" automatically.
6. Run `yarn create-namespace [namespace-name]`. This will create a namespace in your cluster, set up AWS roles, policies and users, K8s roles, groups and role bindings, proper K8s configuration files and AWS access keys for namespace admins and CI (deployments).
7. Access the cluster namespace with newly created resources: Go to newly created folder `./namespaces/[namespace-name]` to find the credentials. You can do `export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... KUBEFILE=./namespaces/[namespace-name]/admin.config.yaml` and manage your namespace using `kubectl` commands from now on.

For now the whole solution looks crappy, but well, it saved me some time, I hope it'll save your too.
