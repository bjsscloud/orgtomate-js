#!/usr/bin/env node
// vim: set syntax=javascript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :

'use strict';

// Require the Orgtomate library
const { orgtomate } = require('./orgtomate');

// Import paginate function
const { paginate } = require('./paginate');

// Require the AWS SDK
const aws = require('aws-sdk');

const roleDurationSeconds = process.env.ROLE_DURATION_SECONDS || 900;
const roleExternalId = process.env.ROLE_EXTERNAL_ID;
const roleName = process.env.ROLE_NAME;
const roleSessionName = process.env.ROLE_SESSION_NAME || 'orgtomateEc2Example.js';

if (!roleExternalId) { throw new Error('ROLE_EXTERNAL_ID not set'); }
if (!roleName) { throw new Error('ROLE_NAME not set'); }

const roleConfig = {
  durationSeconds: roleDurationSeconds,
  externalId: roleExternalId,
  name: roleName,
  sessionName: roleSessionName,
};

let regions = [ 'eu-west-2', 'eu-west-1', 'us-east-1' ];
if (process.env.REGIONS) {
  regions = process.env.REGIONS.split(',');
}

// Just for the purposes of example
const target = null;
const recursive = true;

const die = (error) => {
  console.error(error);
  process.exit(1);
};

// Main handler function
const execute = exports.handler = async () => {
  try {
    // Define the function payload we will send to orgtomate to be
    // executed for each account in the AWS Organization
    // which will receive for each account:
    //   creds: an AWS Credentials Object
    //   awsAccount: the AWS Account object returned from Organizations.listAccounts
    //               with two extra fields: RoleToAssume and Function containing the
    //               details of the cross-account role being used and this function payload
    const functionPayload = async (creds, awsAccount) => {

      // Whatever function code you declare here, will be run once for
      // every account in the Organization in parallel, and whatever
      // you return will be returned into an array. To execute a call
      // against each account, create API objects using the creds object

      // Example:
      //
      // let assumedSts = new aws.STS({credentials: creds});
      // let callerIdentity = await assumedSts.getCallerIdentity().promise();
      // return callerIdentity.Arn;

      //
      // Functional multi-region EC2 Based Example
      //

      // Set up a function to be run in parallel in all desired regions
      const regionalPayload = async (region) => {

        // Set up an EC2 API in the correct region with the assumed role credentials
        const ec2 = new aws.EC2({ credentials: creds, region });

        const paginationConfig = {
          client: ec2,
          operation: 'describeInstances',
          settings: {
            inputToken: 'NextToken',
            outputToken: 'NextToken',
            resultKey: 'Reservations',
          },
          paginate: true,
        };

        const reservations = (
          await paginate(paginationConfig)
            .catch((error) => { return die(error); })
        ).Reservations;

        // As an arbitrary set of data to return
        // Declare {region: [ list of instanceTypes ]} which will be returned
        // as a list when all of the function executions are complete like this:
        // [{region1: [ list of instanceTypes ]}, {region2: [ list of instanceTypes ]}]
        return { [region]: reservations.map((x) => { return x.Instances; }).flat().map((x) => { return x.InstanceType; }) };
      };

      // Execute the regional payloads on all regions in parallel
      const tasks = regions.map(regionalPayload);
      const results = await Promise.all(tasks)
        .catch((error) => { return die(error); });

      // Return an object to form the list of Objects that will be returned
      // when this function is run in parallel against all accounts
      // Making use of the account details passed back into us from orgtomate
      // and the reduced result of the multi-region function executed in parallel
      return {
        accountId: awsAccount.Id,
        accountName: awsAccount.Name,
        // Reduces: [{'eu-west-1': ['t2.micro']},{'eu-west-2': ['t3.micro','m4.xlarge']}]
        // To: {'eu-west-1': ['t2.micro'], 'eu-west-2': ['t3.micro','m4.xlarge']}
        instanceTypes: Object.assign({}, ...results),
      };
    };

    // Execute the function payload against all accounts in the Organization using orgtomate
    const results = await orgtomate(functionPayload, roleConfig, target, recursive)
      .catch((error) => { return die(error); });

    // Log the output in parseable JSON
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    throw error;
  }
};

// If executing from the CLI, run the handler function
if (require.main === module) {
  try {
    execute();
  } catch (error) {
    die(error);
  }
}
