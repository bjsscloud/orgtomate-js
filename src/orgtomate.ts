#!/usr/bin/env node
/** vim: set syntax=typescript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab : */

/**
 * A library providing the means to execute blocks of javascript code across
 * multiple AWS Accounts in an AWS Organization in parallel
 *
 * @module
 */

'use strict';

/** Import the AwsOrgNode Class and Interface */
import { AwsOrgNode } from './aws-org-node';

/** Import the getAwsResults function */
import { getAwsResults } from './get-aws-results';

/**
 * The RoleInfo object type that defines the information
 * that represents the role information object we need to be provided
 * with in order to assume appropriate Organizations Cross-Account Rols
 *
 * @remarks
 * The sessionName, externalId and durationSeconds parameters are optional
 * as they can all be safely defaulted, but in most instances should
 * be provided and defaulted as necessary in the caller.
 *
 * @public
 */
export type RoleInfo = {
  /** The name of the Cross Account Role in each account */
  name: string;

  /** The Role Session Name to assume when assuming the role */
  sessionName?: string | undefined;

  /** The optional External ID to use when assuming the role */
  externalId?: string | undefined;

  /** The Role Duration Seconds for how long the assumed role session will be valid */
  durationSeconds?: number | undefined;
};

/**
 * A Config object type compatible with an AWS STS Service assumeRole operation
 * defining the exact parameters of the role to be assumed
 *
 * @public
 */
export type AssumeRoleConfig = {
  /** The ARN of the Role to assume */
  RoleArn: string;

  /** The session name of the role assumption session */
  RoleSessionName: string;

  /* The optional External ID to use when assuming the role */
  ExternalId?: string | undefined;

  /** The optional length of the role assumption session */
  DurationSeconds?: number | undefined;
};

/**
 * The RoleCredentials object type that represents the result of an
 * STS AssumeRole API call in a form usable in AWS Service constructor
 *
 * @public
 */
export type RoleCredentials = {
  /** An AWS Access Key ID */
  accessKeyId: string;

  /** An AWS Secret Access Key */
  secretAccessKey: string;

  /** An AWS Session Token */
  sessionToken: string;
};

/**
 * An extension to the AwsOrgNode interface from aws-org-node that
 * includes two extra properties that define how Orgtomate
 * will process the account. They're optional so we can
 * add them one by one to the object as we define them
 *
 * @public
 */
export interface ProcessableAccount extends AwsOrgNode {
  /**
   * An AssumeRoleConfig object to be used by the AWS STS AssumeRole call
   * in processAccount to get the role credentials to be passed into the callback
   */
  RoleToAssume: AssumeRoleConfig;

  /**
   * An async callback function that takes credentials credentials and a ProcessableAccount
   * and performs an operation in the account, to return the output of the operation
   */
  AsyncCallback(credentials: RoleCredentials, awsAccount: ProcessableAccount): Promise<any>;
}

/**
 * The implementation of the ProcessableAccount Interface
 *
 * @public
 */
export class ProcessableAccount extends AwsOrgNode {
  constructor() {
    super('ProcessableAccount');
  }
}

/**
 * An async function type that takes credentials and a ProcessableAccount,
 * and returns results for processAccount to amalgamate into an Array
 *
 * @param credentials - A RoleCredentials object containing the credentials to use in an AWS Service constructor
 * @param awsAccount - A ProcessableAccount object containing the details of the account to work in
 * @returns A promise to return the results of the work done in the ProcessableAccount
 * @public
 */
export type AsyncCallbackFunction = (credentials: RoleCredentials, awsAccount: ProcessableAccount) => Promise<any>;

/**
 * The function that performs the assume role per account and calls the asyncCallback with the resulting credentials
 *
 * @param awsAccount - A ProcessableAccount object that contains everything we need to assume a role
 * in a given AWS Account, and execute a callback function in that account using that role
 * @returns A promise to return whatever result the callback function chose to return
 * @public
 */
const processAccount = async (awsAccount: ProcessableAccount): Promise<any> => {
  /**
   * Try, as it may not be possible to assume the role and if we fail
   * we still want other accounts to process successfully
   */
  try {
    const role = await getAwsResults('STS', 'assumeRole', {}, awsAccount.RoleToAssume).catch((error: unknown) => {
      throw error;
    });

    /** Type safety; shouldn't be possible if assumeRole succeeded */
    if (
      !role.Credentials ||
      !role.Credentials.AccessKeyId ||
      !role.Credentials.SecretAccessKey ||
      !role.Credentials.SessionToken
    ) {
      throw new Error('role.Credentials missing from STS Response');
    }

    /** Create a credentials object from the result in the form expected by AWS API object constructors */
    const roleCreds: RoleCredentials = {
      accessKeyId: role.Credentials.AccessKeyId,
      secretAccessKey: role.Credentials.SecretAccessKey,
      sessionToken: role.Credentials.SessionToken,
    };

    /**
     * Execute the asyncCallback, passing in the creds object
     * and the awsAccount object we got and extended from listAccounts.
     * We have no idea what this is going to give us back, and
     * we don't care. We just take callback, and ship the results
     * back en-masse.
     */
    if (!awsAccount.AsyncCallback) {
      throw new Error('Processable Account requires an AsyncCallback property');
    }
    const asyncCallbackResult: any = await awsAccount.AsyncCallback(roleCreds, awsAccount).catch((error: unknown) => {
      throw error;
    });

    return asyncCallbackResult;
  } catch (err: unknown) {
    if (err instanceof Error) {
      /** Use console.error so we dont interrupt automated parsing of JSON output on stdout */
      console.error(`Failed to process account ${awsAccount.Id} :: ${awsAccount.Name} :: ${err.message}`);
    } else {
      console.error(
        `Failed to process account ${awsAccount.Id} :: ${awsAccount.Name} :: Resultant err wasn't an Error?!`,
      );
    }

    /**
     * Return a null object to the array of results from calls to this function
     * we have no way of knowing what type of objects are being returned,
     * so we can't presume to return an empty string or empty object and it's
     * everso slightly safer than returning undefined.
     * The falsitude of this result will allow orgtomate to chomp it
     * from the final Array produced by orgtomate
     */
    return null;
  }
};

/**
 * Orgtomate!
 *
 * Take a function, an Organization cross-account role configuration and a target node in the Organization
 * and run an asyncCallback against every account under that node using the cross-account role
 *
 * @privateRemarks
 * TODO: Make the target optionally the name of a target, not just an ID, without making the processing too messy
 *
 * @param asyncCallback - The async callback function to run
 * @param roleInfo - The information about the role we need to assume in each account
 * @param targetId - An optional ID of a target Node in the Organization parenting all of the accounts to operate in
 * @param recursive - Whether to target all accounts below the target, or only immediate children of it
 * @returns A promise to return an Array containing the result of processAccount for each account targeted
 * @public
 */
export const orgtomate = async (
  asyncCallback: AsyncCallbackFunction,
  roleInfo: RoleInfo,
  targetId: string | null = null,
  recursive = false,
): Promise<Array<any>> => {
  /** Type-safety */
  if (!asyncCallback) {
    throw new Error('Callback Function is required for Orgtomate');
  }
  if (!roleInfo) {
    throw new Error('Cross Account Role Information (roleInfo: RoleInfo) is required for Orgtomate');
  }

  /**
   * The basic targeting logic:
   *
   * If (!targetId || targetId = 'Root' || targetId like 'r-xxxx')
   *   targetNodeType = 'ROOT'
   *
   * If ( targetNodeType === 'Root' && recursive )
   *   listAccounts - Much more efficient than constructing an AwsOrgNode
   *
   * Else
   *   AwsOgNode.getAccountsForParent, ParentID: Target ID, Recursive: recursive
   */

  try {
    /**
     * The Array of ProcessableAccounts we are going to process
     */
    let awsOrgNodesToProcess: Array<AwsOrgNode> = [];
    const processableAccountsToProcess: Array<ProcessableAccount> = [];

    /** Get the Accounts from the Organization we want to operate in */
    try {
      /**
       * Determine what we have been asked to target,
       * and construct an AwsOrgNode that defines it
       */

      let targetNodetype = '';

      if (!targetId || targetId === 'Root' || targetId.match(/^r-[a-z0-9]{4}$/)) {
        targetNodetype = 'ROOT';
      } else if (targetId.match(/^ou-[a-z0-9]+-[a-z0-9]+$/)) {
        targetNodetype = 'ORGANIZATIONAL_UNIT';
      } else if (targetId.match(/^[0-9]{12}$/)) {
        targetNodetype = 'ACCOUNT';
      } else {
        throw new Error(`Invalid Target Identifier: ${targetId}`);
      }

      if (targetNodetype === 'ROOT' && recursive) {
        /**
         * If we want every account in the Organization, don't waste
         * precious time populating an AwsOrgNode tree structure,
         * just get all of the accounts from listAccounts(),
         * convert the results into ProcessableAccounts
         * and add them or our Array of accounts to process
         */

        const accountList: Array<any> = await getAwsResults(
          'Organizations',
          'listAccounts',
          { region: 'us-east-1', maxRetries: 100 },
          {},
          'Accounts',
        ).catch((error: unknown) => {
          throw error;
        });

        accountList.forEach((account) => {
          const newAwsOrgNode: AwsOrgNode = account;
          newAwsOrgNode.nodetype = 'ACCOUNT';
          awsOrgNodesToProcess.push(newAwsOrgNode);
        });
      } else {
        /**
         * We need more than we can get from a single API call to Organizations
         * so let's leverage AwsOrgNode to get a tree, and then get our account list
         * from that tree
         */

        const targetData = new ProcessableAccount();
        targetData.Id = targetId || 'Root';
        targetData.nodetype = targetNodetype;

        const awsOrgNode = await AwsOrgNode.init(targetData).catch((error: unknown) => {
          throw error;
        });

        awsOrgNodesToProcess = awsOrgNode.getAccounts(recursive);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        /** Use console.error so we dont interrupt automated parsing of JSON output on stdout */
        console.error(`Failed to get Account IDs: ${err.message}`);
        throw err;
      } else {
        throw new Error("Failed to get Account IDs: Resultant caught exception (err) wasn't an Error object?!");
      }
    }

    /**
     * We've got all of the accounts we're going to operate on,
     * let's process them
     */

    try {
      /**
       * Set up our processable accounts with their RoleToAssume and AsyncCallback properties
       */

      const roleName = roleInfo.name;
      const roleSessionName = roleInfo.sessionName || 'orgtomate';
      const roleExternalId = roleInfo.externalId || undefined;
      const roleDurationSeconds = roleInfo.durationSeconds || 3600;

      awsOrgNodesToProcess.forEach((awsOrgNode: AwsOrgNode) => {
        const processableAccount: ProcessableAccount = Object.assign(awsOrgNode, {
          AsyncCallback: asyncCallback,
          RoleToAssume: {
            RoleArn: `arn:aws:iam::${awsOrgNode.Id}:role/${roleName}`,
            RoleSessionName: roleSessionName,
          },
        });

        if (roleExternalId) {
          processableAccount.RoleToAssume.ExternalId = roleExternalId;
        }
        if (roleDurationSeconds) {
          processableAccount.RoleToAssume.DurationSeconds = roleDurationSeconds;
        }
        processableAccountsToProcess.push(processableAccount);
      });

      /**
       * That's it - we've got our Array of ProcessableAccounts
       * Map them to the processAccount Function, and await a Promise
       * to process them all in parallel
       */
      const tasks = processableAccountsToProcess.map(processAccount);
      const results = await Promise.all(tasks).catch((error: unknown) => {
        throw error;
      });

      /** Chomp any falsy array elements in the promise response, and return it*/
      return results.filter(Boolean);
    } catch (err: unknown) {
      if (err instanceof Error) {
        /** Use console.error so we dont interrupt automated parsing of JSON output on stdout */
        console.error(`Failed to process accounts: ${err.message}`);
        throw err;
      } else {
        throw new Error("Failed to process accounts: Resultant caught exception (err) wasn't an Error object?!");
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      /** Use console.error so we dont interrupt automated parsing of JSON output on stdout */
      console.error(err, err.stack);
      throw err;
    } else {
      throw new Error("Exception (err) wasn't an Error object?!");
    }
  }
};

/**
 * Common private function for CLI process failure
 *
 * @param error - A thrown Exception or error string
 * @internal
 */
const _die = (error: unknown): void => {
  console.error(error);
  process.exit(1);
};

/**
 * An example invocation
 *
 * @returns An empty promise
 * @internal
 */
const example = async () => {
  const roleDurationSeconds = process.env.ROLE_DURATION_SECONDS ? parseInt(process.env.ROLE_DURATION_SECONDS, 10) : 900;
  const roleExternalId = process.env.ROLE_EXTERNAL_ID || undefined;
  const roleName = process.env.ROLE_NAME;
  const roleSessionName = process.env.ROLE_SESSION_NAME || 'Orgtomate.js';

  if (!roleName) {
    throw new Error('ROLE_NAME not set');
  }

  const roleInfo: RoleInfo = {
    name: roleName,
    sessionName: roleSessionName,
    externalId: roleExternalId,
    durationSeconds: roleDurationSeconds,
  };

  const targetId = null;
  const recursive = true;

  const asyncCallback: AsyncCallbackFunction = async (credentials, awsAccount) => {
    const arn = await getAwsResults('STS', 'getCallerIdentity', { credentials }, {}, 'Arn').catch((error: unknown) => {
      throw error;
    });
    return arn;
  };

  const results = await orgtomate(asyncCallback, roleInfo, targetId, recursive).catch((error: unknown) => {
    throw error;
  });

  console.log(JSON.stringify(results, null, 2));
};

// If executing from the CLI, run the example function
if (require.main === module) {
  example().catch((error: unknown) => {
    _die(error);
  });
}
