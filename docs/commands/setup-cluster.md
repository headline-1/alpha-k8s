<h1>setup-cluster</h1>
<br/>
<div>
Creates a new Kubernetes cluster on AWS.
</div> <h3>Command Parameters</h3>
<br/>
<table> <thead><tr> <td>Configuration name</td> <td>CLI</td> <td>Environmental variable</td> <td>Type</td> <td>Required</td> <td>Default value</td> <td>Description</td> </tr></thead> <tr> <td>name</td> <td>name</td> <td>-</td> <td>string</td> <td>yes</td> <td><pre>-</pre></td> <td>The name of cluster you'd like to create.</td> </tr> <tr> <td>region</td> <td>region</td> <td>AWS_DEFAULT_REGION</td> <td>string</td> <td>yes</td> <td><pre>-</pre></td> <td>The region where the cluster will be created, i.e. eu-west-1</td> </tr> <tr> <td>nodesMin</td> <td>nodesMin</td> <td>-</td> <td>number</td> <td>no</td> <td><pre>1</pre></td> <td>The minimal number of nodes present in the cluster.</td> </tr> <tr> <td>nodesMax</td> <td>nodesMax</td> <td>-</td> <td>number</td> <td>no</td> <td><pre>5</pre></td> <td>The maximal number of nodes present in the cluster.</td> </tr> <tr> <td>sshKey</td> <td>sshKey</td> <td>-</td> <td>string</td> <td>no</td> <td><pre>./cluster_key</pre></td> <td>Path to the SSH key that may be used to access cluster</td> </tr>
</table>
