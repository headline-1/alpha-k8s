<h1>create-namespace</h1>
<br/>
<div>
<p>No description has been provided for this command.</p>
</div> <h3>Command Parameters</h3>
<br/>
<table> <thead><tr> <td>Configuration name</td> <td>CLI</td> <td>Environmental variable</td> <td>Type</td> <td>Required</td> <td>Default value</td> <td>Description</td> </tr></thead> <tr> <td>clusterName</td> <td>-</td> <td>-</td> <td>string</td> <td>yes</td> <td><pre>-</pre></td> <td>The name of K8S cluster</td> </tr> <tr> <td>namespaceName</td> <td>-</td> <td>-</td> <td>string</td> <td>yes</td> <td><pre>-</pre></td> <td>The name of K8S cluster's namespace</td> </tr> <tr> <td>suffix</td> <td>-</td> <td>-</td> <td>string</td> <td>yes</td> <td><pre>-</pre></td> <td>Part of all user name roles, policies and other resources uniquely identifying user in the namespace.</td> </tr> <tr> <td>region</td> <td>-</td> <td>-</td> <td>string</td> <td>yes</td> <td><pre>-</pre></td> <td>Cluster AWS region</td> </tr> <tr> <td>rbacRules</td> <td>-</td> <td>-</td> <td>Array&lt;PartialType&lt;{ apiGroups: Array&lt;string>, nonResourceURLs: Array&lt;string>, resourceNames: Array&lt;string>, resources: Array&lt;string>, verbs: Array&lt;string> }>></td> <td>yes</td> <td><pre>-</pre></td> <td>Role Based Access Control rules for the new role</td> </tr>
</table>
