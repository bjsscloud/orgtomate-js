Orgtomate (NodeJS Version)
==========================

This is still under development.

In short:

* npm install

node ./AwsOrgNode.js
--------------------

A class that represents an AWS Organization object that can be a ROOT, ORGANIZATIONAL_UNIT or ACCOUNT, containing a tree of Children of the same class that self-populates from wherever it begins.
tree starting at any

node ./Orgtomate.js
-------------------
A function that takes a starting point in an AWS Organization, and a function payload, and runs the function payload against every Child AWS Account, recursively in the tree or not.

node ./orgtomateExampleEc2.js
-----------------------------
An example implementation that uses Orgtomate to discover EC2 instances types across a whole Organization in parallel.
