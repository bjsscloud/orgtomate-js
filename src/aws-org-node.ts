#!/usr/bin/env node
/** vim: set syntax=typescript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab : */

/**
 * A way to describe and manage objects in an AWS Organizations Organization,
 * as well as localised extensions to the AWS Organizations API permitting
 * more intelligent inference of object relationships without
 * additional API calls
 *
 * @module
 */

'use strict';

/**
 * We are using only the Organization type from the AWS SDK
 * since it's a guaranteed type returned from describeOrganization
 * for a ROOT node's Organization property
 * Otherwise, we delegate all AWS SDK work to getAwsResults
 */
import { Organization } from 'aws-sdk/clients/organizations';
import { getAwsResults } from './get-aws-results';

/**
 * Organizations only supports us-east-1
 *
 * AwsOrgNode can be quite heavy on the API, the default
 * maxRetries is a gateway to Rate Limit Exceeded exceptions
 */
const orgParams = { region: 'us-east-1', maxRetries: 100 };

/**
 * An interface describing an AwsOrgNode
 *
 * @remarks
 * This can describe an Organization Root, an Organizational Unit or
 * an Account. At this time, I have chosen not to implement these
 * as independent interfaces/classes sharing a super as we are constructing
 * objects from AWS API output directly and the flexibility type-wise
 * of having a single class to represent all of them is valuable
 *
 * *NOTE* this Class does not expect to be instantiated through its
 * constructor as it needs to be initialised through async AWS API calls
 * Therefore, it must be created through the static function init which
 * will return a new AwsOrgNode: [[AwsOrgNode.init]]
 *
 * @public
 */
export interface AwsOrgNode {
  /**
   * String indexable, which permits the inclusion of any additional
   * data the AWS API might give us when we merge results in
   */
  [index: string]: any;

  /**
   * Type of AWS Organizations node: [ 'ROOT', 'ORGANIZATIONAL_UNIT', 'ACCOUNT' ]
   *
   * @defaultValue ROOT
   * @public
   */
  nodetype: string;

  /**
   * ID of the Node: [ 'Root', 'r-0abc', 'ou-0abc-abcdefgh', '123456789012' ]
   *
   * @remarks
   * This is the ID of an AWS Organizations object, but as an Organization may
   * only have one root, it is not critical to initialise a ROOT AwsOrgNode
   * with its Id; it's not worth doing a listRoots call just to find it
   * at construction-time; therefore we permit the special value 'Root'
   * which is also the default
   *
   * @defaultValue Root
   * @public
   */
  Id: string;

  /**
   * Array of Child AwsOrgNode Objects that are direct descendants
   *
   * @defaultValue []
   * @public
   */
  Children: Array<AwsOrgNode>;

  /**
   * Amazon Resource Name (ARN) of this node
   *
   * @public
   */
  Arn?: string;

  /**
   * Name of this node
   *
   * @public
   */
  Name?: string;

  /**
   * Type of this node
   *
   * @remarks
   * This property is not normally used in our objects, but can be merged in from
   * an Organizations.listChildren response, and therefore need to be an optional property
   *
   * @public
   */
  Type?: string; // Unused in our object, but merged in from listChildren

  /** The result of Organizations.describeOrganization, when this is a ROOT node */
  Organization: Organization | undefined;

  /**
   * Add a child AwsOrgNode to the Children Array property
   *
   * @param child - An AwsOrgNode
   * @public
   */
  addChild(child: AwsOrgNode): void;

  /**
   * Get an AwsOrgNode Object that is a direct child of this AwsOrgNode by it's Id property
   *
   * @param Id - The Id of the Child node to find
   * @returns The AwsOrgNode Object with the provided Id, or undefined if it doesn't exist
   * @public
   */
  getChild(Id: string): AwsOrgNode | undefined;

  /**
   * Get an Array of AwsOrgNode Objects that are ancestors of the AwsOrgNode within the tree below this AwsOrgNode
   *
   * @privateRemarks
   * This could probably be made safer by returning an optional undefined, but for the moment
   * it presumes you wouldn't search for an Object ID that doesn't exist
   *
   * @param Id - The Id of the AwsOrgNode to get the Parents for
   * @returns An Array of AwsOrgNode objects that are antecedent to the object with the Id provided
   * @public
   */
  getParentsFor(Id: string): Array<AwsOrgNode>;

  /**
   * Get an Array of AwsOrgNode Objects that are ancestors of the AwsOrgNode, identified by
   * it's Id property, within the tree below this AwsOrgNode - except any that are ROOT nodes.
   *
   * @remarks
   * Identical to getParentsFor, but omit the ROOT, returning only ORGANIZATIONAL_UNITs.
   *
   * @param Id - The Id of the AwsOrgNode to get the Parents OUs for
   * @returns An Array of ORGANIZATIONAL_UNIT AwsOrgNode objects that are antecedent to the object with the Id provided
   * @public
   */
  getParentOusFor(Id: string): Array<AwsOrgNode>;

  /**
   * Get an Array of all ACCOUNT AwsOrgNode Objects that are children of this AwsOrgNode, or optionally of any descendants as well
   *
   * @param recursive - If true, get all accounts in the tree below this nose, if false only get immediate child accounts of this node
   * @returns An Array of ACCOUNT AwsOrgNode objects
   * @public
   */
  getAccounts(recursive?: boolean): Array<AwsOrgNode>;

  /**
   * Get an ACCOUNT AwsOrgNode Object that is a child of this AwsOrgNode, or optionally of any descendants as well
   *
   * @param Id - The ID of an ACCOUNT AwsOrgNode to search for in the tree below this node
   * @param recursive - If true, search the whole tree. If false, only search immediate child accounts of this node
   * @returns An AwsOrgNode object if one is found, or undefined if not
   * @public
   */
  getAccount(Id: string, recursive?: boolean): AwsOrgNode | undefined;

  /**
   * Determine if this AwsOrgNode Object is a ROOT
   *
   * @returns True if the nodetype property is ROOT
   * @public
   */
  isRoot(): boolean;

  /**
   * Determine if this AwsOrgNode Object is an ORGANIZATIONAL_UNIT
   *
   * @returns True if the nodetype property is ORGANIZATIONAL_UNIT
   * @public
   */
  isOrganizationalUnit(): boolean;

  /**
   * Determine if this AwsOrgNode Object is an ACCOUNT
   *
   * @returns True if the nodetype property is ACCOUNT
   * @public
   */
  isAccount(): boolean;

  /**
   * Override of toString inherited from Object: "name (id)"
   *
   * @override
   * @returns "this.name (this.id)"
   * @public
   */
  toString(): string;

  /**
   * A string representation of the tree of AwsOrgNodes beneath this one
   *
   * @param level - A private recursion-control parameter
   * @returns A string representation of the AwsOrgNode tree
   * @public
   */
  toTree(level?: number): string;
}

/**
 * A class implementing an AwsOrgNode Interface
 *
 * @remarks
 * This Class does not expect to be instantiated through its
 * constructor as it needs to be initialised through async AWS API calls
 * Therefore, it must be created through the static function init which
 * will return a new AwsOrgNode: [[AwsOrgNode.init]]
 *
 * @public
 */
export class AwsOrgNode {
  /**
   * @inheritDoc
   * @defaultValue []
   * @public
   */
  // eslint-disable-next-line no-use-before-define
  Children: Array<AwsOrgNode> = [];

  /**
   * Creates a new instance of AwsOrgNode
   *
   * @remarks
   * The constructor is basically empty because we need to call
   * async functions when we initialise the object and
   * therefore we declare the static async function init()
   * which is used in place of the constructor
   *
   * @see [[AwsOrgNode]]
   * @see [[AwsOrgNode.Id]]
   * @see [[AwsOrgNode.nodetype]]
   * @param Id - The Id property for this AwsOrgNode. Optional. Defaults to special string 'Root'A
   * @param nodetype - The nodetype property for this AwsOrgNode. Optional. Defaults to 'ROOT'
   * @returns A placeholder AwsOrgNode object
   * @public
   */
  constructor(Id = 'Root', nodetype = 'ROOT') {
    this.Id = Id;
    this.nodetype = nodetype;
    this.Children = [];
  }

  /**
   * Creates an initialised instance of an AwsOrgNode
   *
   * @remarks
   * This is the _real_ constructor, that calls async functions
   * to populate the Object with the data that makes this object useful
   * By default we are an inferred Organization Root
   * (as opposed to an explicit one defined by an ID like `/r-[0-9a-z]{4}/`)
   *
   * Properties in this class are capitalised based on whether they match data
   * returned from the AWS APIs, or close-enough. nodetype is a concept
   * custom to this class, and therefore lowercase. Arn and Name are returned
   * from the AWS APIs and are therefore TitleCase. This allows us to use
   * Object.assign to merge API results as if they were native object properties.
   *
   * @example
   * ```js
   * const { AwsOrgNode } = require('orgtomate');
   * const awsOrg = await AwsOrgNode.init();
   * console.log(awsOrg.toTree());
   * ```
   *
   * @example
   * ```js
   * e=async()=>{const {AwsOrgNode}=require('.');console.log((await AwsOrgNode.init(new (require('aws-sdk').Organizations)({region:'us-east-1',maxRetries:100}))).toTree());};e();
   * ```
   * @param orgNode - An AwsOrgNode object to initialise. Optional. Defaults to an empty Root node
   * @param skipSuspended - Whether to include AWS Accounts in a SUSPENDED state. Optional. Defaults to false
   * @param orgAccounts - The output from org.listAccounts(). Optional. Performed once per tree initialisation, all children are passed the list generated in the parent's initialisation.
   * @returns A Promise to return the fully initialised AwsOrgNode Object, with all populated Children
   * @public
   */
  static init(
    orgNode: AwsOrgNode = new AwsOrgNode(),
    skipSuspended = false,
    orgAccounts: Array<AwsOrgNode> = [],
  ): Promise<AwsOrgNode> {
    return (
      /**
       * The pseudo-constructor async implementation for the AwsOrgNode class
       *
       * @returns A promise to return a fully initialised AwsOrgNode Object, with all populated Children
       * @internal
       */
      (async function initAsync(): Promise<AwsOrgNode> {
        let thisOrgNode: AwsOrgNode = orgNode;

        /**
         * If we are the first object in the tree being initialised,
         * get the list of accounts from the Organization. This might be
         * more information than we need if we are not a ROOT node,
         * but every child will benefit from having this information available
         * which saves all children from having their properties defined
         * by an individual describeAccount or describeOrganizationalUnit call
         */

        let thisOrgAccounts: Array<AwsOrgNode> = orgAccounts;
        if (thisOrgAccounts.length === 0) {
          thisOrgAccounts = await getAwsResults('Organizations', 'listAccounts', orgParams, {}, 'Accounts').catch(
            (error: unknown) => {
              throw error;
            },
          );
        }

        /** We have very different approaches to initialisation depending on the nodetype */
        switch (thisOrgNode.nodetype) {
          /**
           * If we are an ACCOUNT, populate our JSON Data
           * from the top level listAccounts call
           * and return our initialised AwsOrgNode.
           * ACCOUNTs do not have Children,
           * so there's nothing more to do.
           */
          case 'ACCOUNT': {
            const orgAccountsData: Array<AwsOrgNode> = thisOrgAccounts || [];
            const orgNodeData: AwsOrgNode | undefined = orgAccountsData.find((x: AwsOrgNode) => {
              return x.Id === thisOrgNode.Id;
            });
            if (!orgNodeData) {
              throw new Error(`Failed to find Account ID '${thisOrgNode.Id}' in the Organization`);
            }
            thisOrgNode = Object.assign(thisOrgNode, orgNodeData);
            return thisOrgNode;
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
            if (!thisOrgNode.Name || !thisOrgNode.Arn) {
              const ouData = await getAwsResults(
                'Organizations',
                'describeOrganizationalUnit',
                orgParams,
                { OrganizationalUnitId: thisOrgNode.Id },
                'OrganizationalUnit',
              ).catch((error: unknown) => {
                throw error;
              });
              thisOrgNode = Object.assign(thisOrgNode, ouData);
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
            const roots = await getAwsResults('Organizations', 'listRoots', orgParams, {}, 'Roots').catch(
              (error: unknown) => {
                throw error;
              },
            );

            if (!roots[0]) {
              throw new Error('No root in the Organization!');
            }
            thisOrgNode = Object.assign(thisOrgNode, roots[0]);

            const orgData = await getAwsResults(
              'Organizations',
              'describeOrganization',
              orgParams,
              {},
              'Organization',
            ).catch((error: unknown) => {
              throw error;
            });
            thisOrgNode.Organization = orgData;
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
        const getChildAccounts = getAwsResults(
          'Organizations',
          'listChildren',
          orgParams,
          { ParentId: thisOrgNode.Id, ChildType: 'ACCOUNT' },
          'Children',
        );
        const getChildOus = getAwsResults(
          'Organizations',
          'listOrganizationalUnitsForParent',
          orgParams,
          { ParentId: thisOrgNode.Id },
          'OrganizationalUnits',
        );

        const childrenToPopulate: Array<Array<AwsOrgNode>> = await Promise.all([getChildAccounts, getChildOus]).catch(
          (error: unknown) => {
            throw error;
          },
        );

        /**
         * childrenToPopulate now looks like this:
         * ```
         * [
         *   [
         *     {
         *       Id: <AWS Account ID>,
         *       Type: 'ACCOUNT',
         *       <etc>
         *     },
         *   ],
         *   [
         *     {
         *       Id: <Organizational Unit ID>,
         *       <etc>
         *     },
         *   ]
         * ]
         * ```
         *
         * We need to flatten this out so we can process and populate
         * each child and add it to the Children Array property
         *
         * As we got the ACCOUNT objects from listChildren, we have a
         * nodetype value from Type to re-use. If we don't have a Type
         * property, then the nodetype must be an ORGANIZATIONAL_UNIT
         */

        const flatChildren: Array<AwsOrgNode> = [];
        childrenToPopulate.flat().forEach((child: AwsOrgNode) => {
          const newChild: AwsOrgNode = child;
          newChild.nodetype = newChild.Type ? newChild.Type : 'ORGANIZATIONAL_UNIT';
          flatChildren.push(newChild);
        });

        /**
         * Creates a new initialised AwsOrgNode from template data,
         * and adds it to the current node as a child
         *
         * @privateRemarks
         * Now that we have our flat Array of children
         * iterate the Array and for each one make a recursive
         * call to this function to create and populate
         * the child, and then add the populated child
         * as one of our Children[]
         *
         * @param child - An AWS.Organizations.Account or AWS.Organizations.OrganizationalUnit object returned from listChildren
         * or listOrganizationalUnitsForParent, with a nodetype property added
         * @returns An empty Promise
         */
        const populate = async (child: AwsOrgNode): Promise<void> => {
          const newEmptyChild = Object.assign(new AwsOrgNode(), child);
          const newChild = await AwsOrgNode.init(newEmptyChild, skipSuspended, thisOrgAccounts).catch(
            (error: unknown) => {
              throw error;
            },
          );

          /**
           * Only process SUSPENDED account if we aren't intentionally skipping them
           */
          if (
            !(
              skipSuspended &&
              newChild.nodetype === 'ACCOUNT' &&
              'Status' in newChild &&
              newChild.Status === 'SUSPENDED'
            )
          ) {
            thisOrgNode.addChild(newChild);
          }
        };

        /**
         * Map the Children to one call to populate() per child
         * and await the Promise for each one
         */
        const populationTasks: Array<Promise<void>> = flatChildren.map(populate);
        await Promise.all(populationTasks).catch((error: unknown) => {
          throw error;
        });

        /** All done, return the fully initialised AwsOrgNode tree */
        return thisOrgNode;
      })()
    );
  }

  /**
   * @inheritDoc
   * @public
   */
  addChild = (child: AwsOrgNode): void => {
    this.Children.push(child);
  };

  /**
   * @inheritDoc
   * @public
   */
  getChild = (Id: string): AwsOrgNode | undefined => {
    return this.Children.find((child) => {
      return child.Id === Id;
    });
  };

  /**
   * @inheritDoc
   * @public
   */
  getParentsFor = (Id: string): Array<AwsOrgNode> => {
    let parents: Array<AwsOrgNode> = [];
    if (this.getChild(Id)) {
      parents = [this];
      this.Children.forEach((child: AwsOrgNode) => {
        if (!child.isAccount()) {
          parents = parents.concat(child.getParentsFor(Id));
        }
      });
    }
    return parents;
  };

  /**
   * @inheritDoc
   * @public
   */
  getParentOusFor = (Id: string): Array<AwsOrgNode> => {
    let parents: Array<AwsOrgNode> = [];
    if (this.getChild(Id)) {
      if (!this.isRoot()) {
        parents = [this];
      }
      this.Children.forEach((child: AwsOrgNode) => {
        if (!child.isAccount()) {
          parents = parents.concat(child.getParentOusFor(Id));
        }
      });
    }
    return parents;
  };

  /**
   * @inheritDoc
   * @public
   */
  getAccounts = (recursive = false): Array<AwsOrgNode> => {
    if (this.isAccount()) {
      return [this];
    }

    let accounts: Array<AwsOrgNode> = [];
    if (recursive) {
      this.Children.forEach((child: AwsOrgNode) => {
        accounts = accounts.concat(child.getAccounts(recursive));
      });
    } else {
      accounts = accounts.concat(
        this.Children.filter((x) => {
          return x.nodetype === 'ACCOUNT';
        }),
      );
    }

    return accounts;
  };

  /**
   * @inheritDoc
   * @public
   */
  getAccount = (Id: string, recursive = false): AwsOrgNode | undefined => {
    return this.getAccounts(recursive).find((account) => {
      return account.Id === Id;
    });
  };

  /**
   * @inheritDoc
   * @public
   */
  isAccount = (): boolean => {
    const res = this.nodetype === 'ACCOUNT';
    return res;
  };

  /**
   * @inheritDoc
   * @public
   */
  isOrganizationalUnit = (): boolean => {
    return this.nodetype === 'ORGANIZATIONAL_UNIT';
  };

  /**
   * @inheritDoc
   * @public
   */
  isRoot = (): boolean => {
    return this.nodetype === 'ROOT';
  };

  /**
   * @inheritDoc
   * @public
   * @override
   */
  toString = (): string => {
    return `${this.Name} (${this.Id})`;
  };

  /**
   * @inheritDoc
   * @public
   */
  toTree = (level = 0): string => {
    let ret = '- '.repeat(level) + this.toString();
    this.Children.forEach((child) => {
      ret += `\n${child.toTree(level + 1)}`;
    });
    return ret;
  };
}

/**
 * A function to handle the errors in the command line execution example.
 *
 * @remarks
 * When an error is thrown it is caught and signals an abnormal
 * process exit, printing the error to the console
 *
 * @param error - A thrown Exception or error string
 * @internal
 */
const _die = (error: unknown): void => {
  console.error(error);
  process.exit(1);
};

/**
 * An example invocation of AwsOrgNode against the Root of the Organization
 *
 * @returns An empty promise
 * @internal
 */
const example = async (): Promise<void> => {
  const awsOrg: AwsOrgNode | void = await AwsOrgNode.init().catch((error: unknown) => {
    throw error;
  });

  if (awsOrg) {
    console.log(awsOrg.toTree());
  } else {
    throw new Error('OrgNode Initialisation Failed');
  }
};

/**
 * If executing from the CLI, call the example function
 */
if (require.main === module) {
  example().catch((error: unknown) => {
    _die(error);
  });
}
