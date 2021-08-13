#!/usr/bin/env node
// vim: set syntax=javascript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :
'use strict';

// Require the AWS SDK
const aws = require('aws-sdk');

// Import helper functions
const { asyncForEach, die, paginate } = require('./Helper');
Array.prototype.asyncForEach = asyncForEach;

class AwsOrgNode {
  Children = [];

  constructor () {}

  static init (org, data = { nodetype: 'ROOT' }, orgAccounts = null) {
    return (async function () {
      let orgNode = new AwsOrgNode();

      if (!orgAccounts) {
        const config = {
          client: org,
          operation: 'listAccounts',

          paginationSettings: {
            inputToken: 'NextToken',
            outputToken: 'NextToken',
            resultKey: 'Accounts',
          },
        };

        orgAccounts = await paginate(config);
      }

      if (data) {
        orgNode.nodetype = data.nodetype;
      } else {
        orgNode.nodetype = 'ROOT';
      }

      switch (orgNode.nodetype) {
        case 'ACCOUNT': {
          // If we are an ACCOUNT, populate our JSON Data
          // from the top level listAccounts call
          // and return. ACCOUNTs do not have Children
          const accountData = orgAccounts.Accounts.find((x) => { return x.Id === data.Id; });
          orgNode = Object.assign(orgNode, accountData);
          return orgNode;
        }
        case 'ORGANIZATIONAL_UNIT': {
          orgNode = Object.assign(orgNode, data);
          if (!orgNode.Name || !orgNode.Arn) {
            const ouData = await org.describeOrganizationalUnit({ OrganizationalUnitId: orgNode.Id }).promise();
            orgNode = Object.assign(orgNode, ouData.OrganizationalUnit);
          }
          break;
        }
        case 'ROOT': {
          // Populate the data from listRoots
          // and describeOrganization
          const roots = await org.listRoots().promise();
          orgNode = Object.assign(orgNode, roots.Roots[0]);
          // As an added bonus, add the Organization data
          // to the root orgNode object
          const orgData = await org.describeOrganization().promise();
          orgNode.Organization = orgData.Organization;
          break;
        }
        default:
          throw new Error('Unsupported nodetype');
      }

      const getChildAccountsPaginationConfig = {
        client: org,
        operation: 'listChildren',
        params: { ParentId: orgNode.Id, ChildType: 'ACCOUNT' },
        paginationSettings: { inputToken: 'NextToken', outputToken: 'NextToken', resultKey: 'Children' },
      };
      const getChildAccounts = paginate(getChildAccountsPaginationConfig);

      const getChildOusPaginationConfig = {
        client: org,
        operation: 'listOrganizationalUnitsForParent',
        params: { ParentId: orgNode.Id },
        paginationSettings: { inputToken: 'NextToken', outputToken: 'NextToken', resultKey: 'OrganizationalUnits' },
      };
      const getChildOus = paginate(getChildOusPaginationConfig);

      const childrenToPopulate = await Promise.all([ getChildAccounts, getChildOus ]);

      const flatChildren = [];
      childrenToPopulate.forEach((resultBlock) => {
        Object.values(resultBlock).flat().forEach((child) => {
          child.nodetype = child.Type ? child.Type : 'ORGANIZATIONAL_UNIT';
          flatChildren.push(child);
        });
      });

      const populate = async (child) => {
        const newChild = await AwsOrgNode.init(
          org,
          child,
          orgAccounts,
        );

        orgNode.addChild(newChild);
      };

      const populationTasks = flatChildren.map(populate);
      await Promise.all(populationTasks);

      return orgNode;
    }());
  }

  addChild = (child) => {
    this.Children.push(child);
  }

  getChild = (id) => {
    return this.Children.find((child) => { return child.Id === id; });
  }

  getParentsFor = (accountId) => {
    let parents = [];
    if (this.getChild(accountId)) {
      parents = [ this ];
      this.Children.forEach((child) => {
        if (child.isAccount()) {
          parents = parents.concat(child.getParentsFor(accountId));
        }
      });
    }
    return parents;
  }

  getParentOusFor = (accountId) => {
    let parents = [];
    if (this.getChild(accountId)) {
      if (!this.isRoot()) {
        parents = [ this ];
      }
      this.Children.forEach((child) => {
        if (!child.isAccount()) {
          parents = parents.concat(child.getParentsFor(accountId));
        }
      });
    }
    return parents;
  }

  getAccounts = (recursive) => {
    if (this.isAccount()) {
      return [ this ];
    }

    let accounts = [];
    if (recursive) {
      this.Children.forEach((child) => {
        const childAccounts = child.getAccounts(recursive);
        accounts = accounts.concat(childAccounts);
      });
    } else {
      const accountChildren = this.Children.filter((x) => { return x.nodetype === 'ACCOUNT'; });
      accounts = accounts.concat(accountChildren);
    }

    return accounts;
  }

  getAccount = (id, recursive = false) => {
    return this.getAccounts(recursive).find((account) => { return account.Id === id; });
  }

  isAccount = () => {
    const res = this.nodetype === 'ACCOUNT';
    return res;
  }

  isOrganizationalUnit = () => {
    return this.nodetype === 'ORGANIZATIONAL_UNIT';
  }

  isRoot = () => {
    return this.nodetype === 'ROOT';
  }

  toString = () => {
    return this.Name + ' (' + this.Id + ')';
  }

  toTree = (level = 0) => {
    let ret = '- '.repeat(level) + this;
    this.Children.forEach((child) => {
      ret += '\n' + child.toTree(level + 1);
    });
    return ret;
  }
}

module.exports = AwsOrgNode;

const example = async () => {
  const org = new aws.Organizations({ region: 'us-east-1', maxRetries: 100 });
  const awsOrg = await AwsOrgNode.init(org)
    .catch((error) => { return die(error); });
  console.log(awsOrg.toTree());
};

// If executing from the CLI, run the example function
if (require.main === module) {
  try {
    example();
  } catch (error) {
    die(error);
  }
}
