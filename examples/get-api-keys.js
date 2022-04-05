#!/usr/bin/env node
// vim: set syntax=javascript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :

'use strict';

const { getAwsResults, orgtomate } = require('orgtomate');

/** Get Role Name and decide on regions */
const roleName = process.env.ROLE_NAME;
const roleExternalId = process.env.ROLE_EXTERNAL_ID || undefined;
const regions = [ 'eu-west-2']

/** Process exit if error thrown */
const _die = (error) => { console.error(error); process.exit(1); };

/** Main async function */
const example = async () => {

  if (!roleName) { throw new Error('ROLE_NAME not set') }

  const roleInfo = { name: roleName, externalId: roleExternalId };

  const asyncCallback = async (credentials, awsAccount) => {
    const regionalPayload = async (region) => {
      const regionalClientParams = { credentials, region };


      /** Do Your Thing here... put final results in awsResults */


      const awsResults = [];

      /** Get Certificates with an ISSUED status */
      const userList = await getAwsResults('IAM', 'listUsers', regionalClientParams).catch((error) => { throw error })

      /** Get an object for each one that is ineligible for renewal, but in use */
      userList.Users.forEach(async (user) => {
        const accessKeys = await getAwsResults('IAM', 'listAccessKeys', regionalClientParams, {UserName: user.UserName}).catch((error) => { throw error });

        accessKeys.AccessKeyMetadata.forEach(async (accessKey) => {
          const { UserName, AccessKeyId, Status, CreateDate } = accessKey;

          if (Status == 'Active') {
            awsResults.push({UserName, AccessKeyId, CreateDate});
          }
        });

      });


      /** End of Do Your Thing */


      const regionalPayloadResult = {
        accountId: awsAccount.Id,
        accountName: awsAccount.Name,
        region,
        results: awsResults,
      };

      return regionalPayloadResult;
    };

    const regionalTasks = regions.map(regionalPayload);
    const regionalTaskResults = await Promise.all(regionalTasks).catch((error) => { throw error });
    return regionalTaskResults;
  }

  const results = await orgtomate(asyncCallback, roleInfo, null, true).catch((error) => { throw error });


  /** Handle Your Thing here */


  const out = {};
  results.flat().forEach((result) => {
    if (result.results.length > 0) {
      out[result.accountName] = result.results;
    }
  });
  console.log(require('util').inspect(Object.fromEntries(Object.entries(out).sort()), {depth:null}));


  /** End of Handle Your Thing */


};

/** If executing from the CLI, run the example function */
if (require.main === module) {
  example().catch((error) => {
    _die(error);
  });
}
