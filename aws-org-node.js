#!/usr/bin/env node
// vim: set syntax=javascript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :

'use strict';

// Require the AWS SDK
const aws = require('aws-sdk');

// Import paginate function
const { paginate } = require('./paginate');

class AwsOrgNode {
  /**
   * @public
   * @description AwsOrgNode Objects that are Children of this Object
   * @type AwsOrgNode[]
   */
  Children = [];

  /**
   * Creates a new instance of AwsOrgNode
   *
   * The constructor is empty because we need to call
   * async functions when we initialise the object and
   * therefore we declare the static async function init()
   * which is used in place of the constructor
   *
   * @constructor
   * @classdesc AwsOrgNode representing an AWS Organizations Organization Tree Node
   * @returns {AwsOrgNode} Returns a placeholder AwsOrgNode object
   */
  constructor () {}

  /**
   * Creates an initialised instance of an AwsOrgNode
   *
   * This is the _real_ constructor, that calls async functions
   * to populate the Object with the data that makes this object useful
   * By default we are an inferred Organization Root
   * (as opposed to an explicit one defined by an ID like /r-[0-9a-z]{4}/)
   *
   * Properties in this class are capitalised based on whether they match data
   * returned from the AWS APIs, or close-enough. nodetype is a concept
   * custom to this class, and therefore lowercase. Arn and Name are returned
   * from the AWS APIs and are therefore TitleCase. This allows us to use
   * Object.assign to merge API results as if they were native object properties.
   *
   * @function init
   * @static
   * @async
   * @summary async pseudo-constructor for the AwsOrgNode class
   * @example const awsOrg = await AwsOrgNode.init(org)
   * @param {AWS.Organizations} org An AWS Organizations Service Interface Object from the AWS SDK
   * @param {Object} data An object containing initialisation data
   * @param {string} data.nodetype The nodetype of the AwsOrgNode: [ROOT|ORGANIZATIONAL_UNIT|ACCOUNT]. Default: 'ROOT'
   * @param {string} data.Id The Id of the AwsOrgNode. Required unless data.nodetype == 'ROOT'
   * @param {string} data.Name The Name of the AwsOrgNode. Optional. Used when nodetype==ORGANIZATIONAL_UNIT to save a describeOrganizationalUnit query
   * @param {string} data.Arn The ARN of the AwsOrgNode. Optional. Used when nodetype==ORGANIZATIONAL_UNIT to save a describeOrganizationalUnit query
   * @param {Object} orgAccounts The output from org.listAccounts(). Optional. Performed once per tree initialisation, all children are passed list generated in the parent's initialisation.
   * @returns {Promise<AwsOrgNode>} A Promise to return the fully initialised AwsOrgNode Object, with all populated Children
   */
  static init (org, data = { nodetype: 'ROOT' }, orgAccounts = null) {
    return (async function () {

      /**
       * Call the empty constructor to make an Object that
       * represents `this` which we will return as the
       * result of this fake constructor
       */
      let orgNode = new AwsOrgNode();


      /**
       * If we are the first object in the tree being initialised,
       * get the list of accounts from the Organization. This might be
       * more information than we need if we are not a ROOT node,
       * but every child will benefit from having this information available
       * which saves all children from having their properties defined
       * by an individual describeAccount or describeOrganizationalUnit call
       */
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

      /**
       * It is possible for a caller to pass us data=null or data=undefined
       * This will override our default data={nodetype: 'ROOT'}
       * If the default has been overridden, we handle both cases.
       * If data has been set, set the nodetype property from it
       * If data has been unset, the nodetype can only be ROOT
       */
      if (data) {
        orgNode.nodetype = data.nodetype;
      } else {
        orgNode.nodetype = 'ROOT';
      }

      /** We have very different approaches to initialisation depending on the nodetype */
      switch (orgNode.nodetype) {
        /**
         * If we are an ACCOUNT, populate our JSON Data
         * from the top level listAccounts call
         * and return our initialised AwsOrgNode.
         * ACCOUNTs do not have Children,
         * so there's nothing more to do.
         */
        case 'ACCOUNT': {
          const accountData = orgAccounts.Accounts.find((x) => { return x.Id === data.Id; });
          orgNode = Object.assign(orgNode, accountData);
          return orgNode;
        }
        /**
         * If we are an ORGANIZATIONAL_UNIT, we should have everything
         * we need already, as most ORGANIZATIONAL_UNIT's will be created
         * by a parent node that already knows the Id, Arn, Name and nodetype
         * of the object. This saves us from having to describe the OU with an API call.
         * If however we haven't got that information, then it's not fatal,
         * we can do a describeOrganizationalUnit to get the information before we move on.
         */
        case 'ORGANIZATIONAL_UNIT': {
          orgNode = Object.assign(orgNode, data);
          if (!orgNode.Name || !orgNode.Arn) {
            const ouData = await org.describeOrganizationalUnit({ OrganizationalUnitId: orgNode.Id }).promise();
            orgNode = Object.assign(orgNode, ouData.OrganizationalUnit);
          }
          break;
        }
        /**
         * If we are a ROOT, populate our information from org.listRoots
         * We could technically retain a custom Id passed in from data.Id
         * but as Organizations only support one root, it's somewhat
         * immaterial, and we still want the rest of the data listRoots
         * returns to us. Potentially revisit if they ever enable multi-root support.
         * As an added bonus, add the result of describeOrganization as a property.
         */
        case 'ROOT': {
          const roots = await org.listRoots().promise();
          orgNode = Object.assign(orgNode, roots.Roots[0]);

          const orgData = await org.describeOrganization().promise();
          orgNode.Organization = orgData.Organization;
          break;
        }
        default:
          throw new Error('Unsupported nodetype');
      }

      /**
       * We are now a fully-fledged AwsOrgNode, and we are not an ACCOUNT,
       * therefore we are ready to populate any children in the tree.
       * We want to do this asynchronously so we will define
       * two calls to the async function paginate, and then await promises for both
       */

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

      /**
       * childrenToPopulate now looks like this:
       * [
       *   {
       *     Children = [
       *       {
       *         Id: <AWS Account ID>,
       *         Type: 'ACCOUNT',
       *         <etc>
       *       },
       *     ]
       *   },
       *   {
       *     OrganizationalUnits = [
       *       {
       *         Id: <Organizational Unit ID>,
       *         <etc>
       *       },
       *     ]
       *   }
       * ]
       *
       * We need to flatten this out so we can process and populate
       * each child and add it to the Children Array property
       *
       * As we got the ACCOUNT objects from listChildren, we have a
       * nodetype value from Type to re-use. If we don't have a Type
       * property, then the nodetype must be an ORGANIZATIONAL_UNIT
       */
      const flatChildren = [];
      childrenToPopulate.forEach((resultBlock) => {
        Object.values(resultBlock).flat().forEach((child) => {
          child.nodetype = child.Type ? child.Type : 'ORGANIZATIONAL_UNIT';
          flatChildren.push(child);
        });
      });

      /**
       * Now that we have our flat Array of children
       * iterate the Array and for each one make a recursive
       * call to this function to create and populate
       * the child, and then add the populated child
       * as one of our Children[]
       *
       * @async
       * @function populate
       * @description Populate a child AwsOrgNode and add it to the Children Array
       * @param {Object} child An ACCOUNT or ORGANIZATIONAL_UNIT object returned from listChildren
       * or listOrganizationalUnitsForParent, with a nodetype property added
       * @returns {Promise<undefined>} No value is expected from this function
       */
      const populate = async (child) => {
        const newChild = await AwsOrgNode.init(
          org,
          child,
          orgAccounts,
        );

        orgNode.addChild(newChild);
      };

      /**
       * Map the Children to one call to populate() per child
       * and await the Promise for each one
       */
      const populationTasks = flatChildren.map(populate);
      await Promise.all(populationTasks);

      /** All done, return the fully initialised AwsOrgNode tree */
      return orgNode;
    }());
  }

  /**
   * @function addChild
   * @description Add a child AwsOrgNode to the Children Array property
   * @param {AwsOrgNode} child An AwsOrgNode
   * @returns {undefined}
   */
  addChild = (child) => {
    this.Children.push(child);
  }

  /**
   * @function getChild
   * @description Get an AwsOrgNode Object that is a direct child of this AwsOrgNode by it's Id property
   * @param {string} id The Id property of the Child to find
   * @returns {AwsOrgNode} The AwsOrgNode found as a direct child of this AwsOrgNode
   */
  getChild = (id) => {
    return this.Children.find((child) => { return child.Id === id; });
  }

  /**
   * @function getParentsFor
   * @description Get an Array of AwsOrgNode Objects that are ancestors of the ACCOUNT AwsOrgNode within the tree below this AwsOrgNode
   * @param {string} accountId The Id of an ACCOUNT AwsOrgNode
   * @returns {AwsOrgNode[]} Array of ORGANIZATIONAL_UNIT or ROOT AwsOrgNode Objects
   */
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

  /**
   * @function getParentOusFor
   * @description Identical to getParentsFor, but omit the ROOT, returning only ORGANIZATIONAL_UNITs. Get an Array of all AwsOrgNode Objects that are ancestors of the ACCOUNT AwsOrgNode within the tree below this AwsOrgNode, idenitified by it's Id property
   * @param {string} accountId The Id of an ACCOUNT AwsOrgNode
   * @returns {AwsOrgNode[]} Array of ORGANIZATIONAL_UNIT AwsOrgNode Objects
   */
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

  /**
   * @function getAccounts
   * @description Get an Array of ACCOUNT AwsOrgNode Objects that are children of this AwsOrgNode, or optionally of any descendants as well
   * @param {boolean} [recursive=false] Recurse descendants or just return immediate children
   * @returns {AwsOrgNode[]} Array of ACCOUNT AwsOrgNode Objects
   */
  getAccounts = (recursive = false) => {
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

  /**
   * @function getAccount
   * @description Get an ACCOUNT AwsOrgNode Object that is a child of this AwsOrgNode, or optionally of any descendants as well
   * @param {string} id Id property of the AwsOrgNode Object to ge
   * @param {boolean} [recursive=false] Recurse descendants or just search immediate children
   * @returns {AwsOrgNode} An ACCOUNT AwsOrgNode Object
   */
  getAccount = (id, recursive = false) => {
    return this.getAccounts(recursive).find((account) => { return account.Id === id; });
  }

  /**
   * @function isAccount
   * @description Determine if this AwsOrgNode Object is an ACCOUNT
   * @returns {boolean} True if this is an ACCOUNT
   */
  isAccount = () => {
    const res = this.nodetype === 'ACCOUNT';
    return res;
  }

  /**
   * @function isOrganizationalUnit
   * @description Determine if this AwsOrgNode Object is an ORGANIZATIONAL_UNIT
   * @returns {boolean} True if this is an ORGANIZATIONAL_UNIT
   */
  isOrganizationalUnit = () => {
    return this.nodetype === 'ORGANIZATIONAL_UNIT';
  }

  /**
   * @function isRoot
   * @description Determine if this AwsOrgNode Object is a ROOT
   * @returns {boolean} True if this is a ROOT
   */
  isRoot = () => {
    return this.nodetype === 'ROOT';
  }

  /**
   * @function tostring
   * @override
   * @description Override of tostring inherited from Object: "name (id)"
   * @returns {string} String representation of an AwsOrgNode
   */
  tostring = () => {
    return this.Name + ' (' + this.Id + ')';
  }

  /**
   * @function toTree
   * @description A string representation of the tree of AwsOrgNodes beneath this one
   * @param {number} level The current depth of this node in a recursive toTree call
   * @returns {string} Multiline string representation of an AwsOrgNode tree
   */
  toTree = (level = 0) => {
    let ret = '- '.repeat(level) + this;
    this.Children.forEach((child) => {
      ret += '\n' + child.toTree(level + 1);
    });
    return ret;
  }
}

/**
 * Export the AwsOrgNode Class
 */
module.exports = AwsOrgNode;

const die = (error) => {
  console.error(error);
  process.exit(1);
};

/**
 * @function example
 * @async
 * @description An example invocation of AwsOrgNode against the Root of the Organization
 * @returns {undefined}
 */
const example = async () => {
  const org = new aws.Organizations({ region: 'us-east-1', maxRetries: 100 });
  const awsOrg = await AwsOrgNode.init(org)
    .catch((error) => { return die(error); });
  console.log(awsOrg.toTree());
};

/**
 * If executing from the CLI, call the example function
 */
if (require.main === module) {
  try {
    example();
  } catch (error) {
    die(error);
  }
}
