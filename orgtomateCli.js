#!/usr/bin/env node
// vim: set syntax=javascript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :

'use strict';

const aws = require('aws-sdk');
const yargs = require('yargs');
const { die, paginate } = require('./Helper');
const orgtomate = require('./Orgtomate');
const { serialize, deserialize } = require('v8');

const awsRegion = process.env.AWS_REGION;
const awsDefaultRegion = process.env.AWS_DEFAULT_REGION;
const defaultRegion = awsDefaultRegion || awsRegion || 'us-east-1';

const roleDurationSeconds = process.env.ROLE_DURATION_SECONDS || 900;
const roleExternalId = process.env.ROLE_EXTERNAL_ID;
const roleName = process.env.ROLE_NAME;
const roleSessionName = process.env.ROLE_SESSION_NAME || 'orgtomateCli.js';

const options = yargs
  .usage('Usage: -s <service>')
  .option('s', {
    alias: 'service',
    type: 'string',
    demandOption: true,
    describe: 'Service Name (AWS API Client Name)',
  })
  .option('o', {
    alias: 'operation',
    type: 'string',
    demandOption: true,
    describe: 'Operation Name (AWS API Client Function Name)',
  })
  .option('r', {
    alias: 'regions',
    type: 'string',
    default: defaultRegion,
    describe: 'Comma separated list of regions to execute queries against. Defaults to AWS_DEFAULT_REGION/AWS_REGION from environment',
  })
  .option('f', {
    alias: 'format',
    type: 'string',
    default: 'flat',
    describe: "Output format. Can be: 'flat', 'full', 'regions', 'accoutids', 'accountnames'",
  })
  .option('c', {
    alias: 'client-args',
    type: 'string',
    describe: 'Arguments for the API Client Constructor: key1=value1,key2=value2',
  })
  .option('a', {
    alias: 'operation-args',
    type: 'string',
    describe: 'Arguments for the API Client Operation: key1=value1,key2=value2',
  })
  .option('p', {
    alias: 'pagination',
    type: 'string',
    describe: '"false" or Custom Pagination: inputToken,outputToken,resultKey[,moreResults]',
  })
  .option('t', {
    alias: 'orgtomate',
    type: 'string',
    describe: '"Root" or ID of an Organizations Object (Root, Organizational Unit or Account)',
  })
  .option('y', {
    alias: 'recursive',
    type: 'string',
    default: 'true',
    describe: 'Whether to recursively apply to all accounts, or only the accounts directly beneath the target node',
  })
  .option('n', {
    alias: 'role-name',
    type: 'string',
    default: roleName,
    describe: 'Orgtomation Cross Account Role Name',
  })
  .option('e', {
    alias: 'external-id',
    type: 'string',
    default: roleExternalId,
    describe: 'Orgtomation Cross Account Role External ID',
  })
  .option('d', {
    alias: 'session-duration',
    type: 'string',
    default: roleDurationSeconds,
    describe: 'Orgtomation Cross Account Role Session Duration',
  })
  .option('x', {
    alias: 'session-name',
    type: 'string',
    default: roleSessionName,
    describe: 'Orgtomation Cross Account Role Session Name',
  })
  .check((argv) => {
    if (argv.p && argv.p !== 'false') {
      if (argv.p.match(/^[A-Za-z]+,[A-Za-z]+,[A-Za-z]/)) {
        return true;
      }

      return `ERROR: Inappropriate value for pagination: ${argv.p} - Should be omitted, false or "inputToken,outputToken,resultKey[,moreResults]"`;
    }

    return true;
  })
  .check((argv) => {
    if (argv.t) {
      let assert = true;
      if (!argv.y) { assert = "ERROR: When using --orgtomate/-t: --recursive/-y must be set to 'true' or 'false'"; }
      if (!argv.n) { assert = 'ERROR: When using --orgtomate/-t: either --role-name/-n must be set or ROLE_NAME environment variable must be set'; }
      if (!argv.e) { assert = 'ERROR: When using --orgtomate/-t: either --external-id/-e must be set or ROLE_EXTERNAL_ID environment variable must be set'; }
      if (!argv.d) { assert = 'ERROR: When using --orgtomate/-t: either --session-duration/-d must be set or ROLE_DURATION_SECONDS environment variable must be set'; }
      if (!argv.x) { assert = 'ERROR: When using --orgtomate/-t: either --session-name/-x must be set or ROLE_SESSION_NAME environment variable must be set'; }
      return assert;
    } else {
      if (argv.f) {
        if (argv.f === 'accountids' || argv.f === 'accountnames' ) {
          return 'accountids/accountnames output formats can only be used in conjuction with --orgtomate/-t';
        }
      }
    }

    return true;
  })
  .argv;

const execute = async () => {
  try {

    // Validate the SDK provides the requested Service
    const clients = Object.keys(require('aws-sdk/clients/all'));
    if (!clients.includes(options.service)) {
      console.error('Invalid AWS Service');
      process.exit(1);
    }

    // Create the parameters that will be fed to the Service Constructor
    const clientArgsMap = {};
    if (options['client-args']) {
      options['client-args'].split(',').forEach((element) => {
        const arr = element.split('=');
        clientArgsMap[arr[0]] = arr[1];
      });
    }

    // Initialise the configuration map that our libraries will use
    // for information about the operation we're executing
    const config = {};

    // Set the name of the Operation as passed by the user
    config.operation = options.operation;

    // If the user has passed additional arguments for the operation
    // construct the map that will be passed to the API function call
    if (options['operation-args']) {
      config.params = {};
      options['operation-args'].split(',').forEach((element) => {
        const arr = element.split('=');
        config.params[arr[0]] = arr[1];
      });
    }

    // Paginate by default
    config.paginate = true;

    // Modify pagination if pagination options were passed
    if (options.pagination) {
      if (options.pagination === 'false') {
        // If we were told not to paginate, then don't
        config.paginate = false;
      } else {
        // We were given pagination parameters
        // set them up within our config map as
        // custom pagination settings
        const paginationOptions = options.pagination.split(',');
        config.paginationSettings = {
          inputToken: paginationOptions[0],
          outputToken: paginationOptions[1],
          resultKey: paginationOptions[2],
          moreResults: paginationOptions[3],
        };
      }
    }

    // By default, do not use Orgtomate - just run on the local account
    config.orgtomate = false;
    config.target = undefined;

    // Oooo we *are* going to Orgtomate!
    if (options.orgtomate) {
      config.orgtomate = true;

      if (options.orgtomate !== 'Root') {
        config.target = options.orgtomate;
      }
    }

    // Get our regions from the user. If the user didn't
    // specify multiple regions, we'll just work in the one we have
    const regions = options.regions.split(',');

    // Get our console output format preference from options
    const outputFormat = options.format;

    // Here we go!
    let results;
    if (config.orgtomate) {

      // Set up the Cross Account Role configuration for Orgtomation
      const roleConfig = {
        durationSeconds: options['duration-seconds'],
        externalId: options['external-id'],
        name: options['role-name'],
        sessionName: options['session-name'],
      };

      // Command line options can only be strings
      // I could validate this in yargs, but meh
      let recurse;
      switch (options.recursive) {
        case 'true':
          recurse = true;
          break;
        case 'false':
          recurse = false;
          break;
        default:
          die("recursive (-y) should be either 'true' or 'false'");
      }

      // This is the function payload we are going to run in parallel
      // against every AWS Account we are targeting
      //
      // Orgtomate will send us a creds object and an awsOrgNode object
      // for the cross account role credentials to use and the
      // account we are going to operate on
      const functionPayload = async (creds, awsAccount) => {

        // Because we're greedy, let's set up another function payload
        // so that we can run the command in multiple regions in parallel
        // for each account
        const regionalPayload = async (region) => {

          // Engage the triplicator!
          // We need a new copy of the config so that our asynchronous threads
          // aren't all messing with the client property in the same config object
          // I don't know of a better way to deep-duplicate an object
          const regionalConfig = deserialize(serialize(config));

          // The actual AWS API Client Constructor
          regionalConfig.client = new aws[options.service](Object.assign({ region, credentials: creds }, clientArgsMap));

          // Return all the useful information about the account and region we are operating in
          // as well as the results of the paginate() call that executes our operation
          // (even though technically it may not paginate, depending on our options
          // and whether auto-pagination is possible for this command)
          //
          // We have to return all of this information here. All of the function executions
          // down to this level are parallelised asynchronous Promises, and the results
          // are all just lists of result objects. Once all of the results have been collated
          // the contents of this object are all that determine which results belong to which
          // account and region. We technically could look up the name later from the ID
          // but adding the name here, since we have it in the AwsOrgNode object makes parsing
          // the output so much easier.
          return {
            accountId: awsAccount.Id,
            accountName: awsAccount.Name,
            region,
            results: await paginate(regionalConfig),
          };
        };

        // Map one regionalPayload function to each region
        // we have been configured to run against in this account
        const regionalTasks = regions.map(regionalPayload);

        // Execute the regional payloads on all regions in parallel
        // for the account we are running against
        const regionalTaskResults = await Promise.all(regionalTasks);
        // We could process exit on failure, but don't
        //.catch((error) => { return die(error); });

        // Return out list of one result per region
        return regionalTaskResults;
      };

      const allResults = await orgtomate(functionPayload, roleConfig, config.target, recurse)
        .catch((error) => { return die(error); });

      results = allResults.flat();

    } else {
      // No Orgtomate, Denied!
      const regionalPayload = async (region) => {
        // Engage the triplicator!
        const regionalConfig = deserialize(serialize(config));

        regionalConfig.client = new aws[options.service](Object.assign({ region }, clientArgsMap));

        const regionalResult = await paginate(regionalConfig);

        return {
          region,
          results: regionalResult,
        }
      }

      const regionalTasks = regions.map(regionalPayload);
      results = await Promise.all(regionalTasks);
    }

    const arrangeResultsBy = (results, method) => {
      const ret = {};
      results.forEach((result) => {
        if (result) {
          const index = result[method];
          Object.entries(result.results).forEach(([ key, value ]) => {
            if (!ret[index]) { ret[index] = { [key]: [] }; }
            ret[index][key] = ret[index][key].concat(value);
          });
        }
      });
      return ret;
    };

    let consoleOutput = null;
    switch (outputFormat) {
      case 'flat': {
        const flatResults = {};
        results.forEach((result) => {
          if (result) {
            Object.entries(result.results).forEach(([ key, value ]) => {
              if (!flatResults[key]) { flatResults[key] = []; }
              flatResults[key] = flatResults[key].concat(value);
            });
          }
        });
        consoleOutput = flatResults;
        break;
      }
      case 'regions':
        consoleOutput = arrangeResultsBy(results, 'region');
        break;
      case 'accountids':
        consoleOutput = arrangeResultsBy(results, 'accountId');
        break;
      case 'accountnames':
        consoleOutput = arrangeResultsBy(results, 'accountName');
        break;
      case 'full':
        consoleOutput = results;
        break;
      default:
        die('Invalid output format');
        break;
    }

    console.log(JSON.stringify(consoleOutput, null, 2));
    return;

  } catch (error) {
    throw error;
  }
};
// If executing from the CLI, run the execute function
if (require.main === module) {
  try {
    execute();
  } catch (error) {
    die(error);
  }
}
