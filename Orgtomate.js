#!/usr/bin/env node
// vim: set syntax=javascript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :

'use strict';

// Require the AWS SDK
const aws = require('aws-sdk');

// Import AwsOrgNode Class
const AwsOrgNode = require('./AwsOrgNode');

// Import paginate function
const { paginate } = require('./Paginate');

// The function that performs the assume role
// per account and calls the function payload
// with the resulting credentials
const processAccount = async (awsAccount) => {

  // Try, as it may not be possible to assume the role
  // and if we fail we still want other accounts to
  // process successfully.
  try {
    // Initialize the STS API object
    const sts = new aws.STS();

    // Get the temporary credentials for the role from the API
    const role = await sts.assumeRole(awsAccount.RoleToAssume).promise();

    // Create a credentials object from the result in the form
    // expected by AWS API object constructors
    const roleCreds = {
      accessKeyId: role.Credentials.AccessKeyId,
      secretAccessKey: role.Credentials.SecretAccessKey,
      sessionToken: role.Credentials.SessionToken,
    };

    // Execute the function payload, passing in the creds object
    // and the awsAccount object we got and extended from listAccounts
    return await awsAccount.Function(roleCreds, awsAccount);
  } catch (err) {
    // Use console.error so we dont interrupt automated parsing of JSON output
    console.error(`Failed to process account ${awsAccount.Id} :: ${awsAccount.Name} :: ${err.message}`);
    // Return a null object to the array of results from calls to this function
    // we have no way of knowing what type of objects are being returned,
    // so we can't presume to return an empty string or empty object
    return null;
  }
};

// Orgtomate!
// Take a function, an Organization cross-account role configuration and a target node in the Organization
// and run the function payload against every account under that node using the cross-account role
const orgtomate = async (functionPayload, roleConfig, target = null, recursive = false) => {

  if (!functionPayload) { throw new Error('Function Payload (functionPayload) is required for Orgtomate'); }
  if (!roleConfig) { throw new Error('Cross Account Role Configuration (roleConfig) is required for Orgtomate'); }

  // If !targetOu
  //   target=get_root
  //
  // If !targetOu && recursive=true
  //   listAccounts
  //
  // If !targetOut && recursive=false
  //   listAccountsForParent ParentId: Root
  //
  // If targetOu && recursive=true
  //   goDeep()
  //
  // If targetOu && recursive=false
  //   listAccountsForParent ParentId: OU

  try {

    // AwsOrgNode Object
    let orgAccounts = {};

    // Get the Accounts in the Organization
    try {
      const org = new aws.Organizations({ region: 'us-east-1', maxRetries: 100 });

      const targetData = {};
      if (target) {
        let nodetype = null;
        if (target.match(/^ou-[a-z0-9]+-[a-z0-9]+$/)) {
          nodetype = 'ORGANIZATIONAL_UNIT';
        } else if (target.match(/^r-[a-z0-9]+$/)) {
          nodetype = 'ROOT';
        } else if (target.match(/^[0-9]{12}$/)) {
          nodetype = 'ACCOUNT';
        } else {
          throw new Error('Invalid Target Identifier: ' + target);
        }

        targetData.Id = target;
        targetData.nodetype = nodetype;

        const awsOrg = await AwsOrgNode.init(org, targetData);
        orgAccounts = awsOrg.getAccounts(recursive);
      } else {
        // Don't populate an AwsOrgNode if we want every account
        // in the Organization for speed. Emulate AwsOrgNode objects
        const config = {
          client: org,
          operation: 'listAccounts',

          paginationSettings: {
            inputToken: 'NextToken',
            outputToken: 'NextToken',
            resultKey: 'Accounts',
          },
        };

        orgAccounts = (await paginate(config)).Accounts;

        orgAccounts.map((account) => {
          account.Children = [];
          account.nodetype = 'ACCOUNT';
          return account;
        });
      }

    } catch (err) {
      console.error('Failed to get Account IDs: ' + err.message);
      throw err;
    }

    // Process all controls in all regions for this AWS Account
    try {

      const roleName = roleConfig.name;
      const roleSessionName = roleConfig.sessionName;
      const roleExternalId = roleConfig.externalId;
      const roleDurationSeconds = roleConfig.durationSeconds;

      orgAccounts.forEach((element) => {
        element.Function = functionPayload;
        element.RoleToAssume = {
          RoleArn: `arn:aws:iam::${element.Id}:role/${roleName}`,
          RoleSessionName: roleSessionName,
          ExternalId: roleExternalId,
          DurationSeconds: roleDurationSeconds,
        };
      });

      const tasks = orgAccounts.map(processAccount);
      const results = await Promise.all(tasks);

      return results;

    } catch (err) {
      console.error('Failed to process accounts: ' + err.message);
      throw err;
    }
  } catch (err) {
    console.error(err, err.stack);
    throw err;
  }
};

module.exports = orgtomate;

const die = (error) => {
  console.error(error);
  process.exit(1);
};

const example = async () => {
  const roleDurationSeconds = process.env.ROLE_DURATION_SECONDS || 900;
  const roleExternalId = process.env.ROLE_EXTERNAL_ID;
  const roleName = process.env.ROLE_NAME;
  const roleSessionName = process.env.ROLE_SESSION_NAME || 'Orgtomate.js';

  if (!roleExternalId) { throw new Error('ROLE_EXTERNAL_ID not set'); }
  if (!roleName) { throw new Error('ROLE_NAME not set'); }

  const roleConfig = {
    durationSeconds: roleDurationSeconds,
    externalId: roleExternalId,
    name: roleName,
    sessionName: roleSessionName,
  };

  const ou = null;
  const recursive = true;

  const functionPayload = async (creds, awsAccount) => {
    const assumedSts = new aws.STS({ credentials: creds });
    const callerIdentity = await assumedSts.getCallerIdentity().promise()
      .catch((error) => { return die(error); });
    return callerIdentity.Arn;
  };

  const results = await orgtomate(functionPayload, roleConfig, ou, recursive)
    .catch((error) => { return die(error); });

  console.log(JSON.stringify(results, null, 2));
};

// If executing from the CLI, run the example function
if (require.main === module) {
  try {
    example();
  } catch (error) {
    die(error);
  }
}
