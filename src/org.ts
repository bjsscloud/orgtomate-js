#!/usr/bin/env node
/** vim: set syntax=typescript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab : */

/**
 * A command-line interface as a replacement for, or supplement to, the AWS CLI
 * that is not only faster than the AWS CLI, but also allows the execution of operations
 * in multiple AWS Accounts and Regions in parallel using Orgtomate.
 *
 * @module
 */

'use strict';

/**
 * We're not actually using the AWS-SDK to make API calls,
 * we leave that to getAwsResults, but we use this to validate
 * the options we've passed as the object keys on clients/all
 * gives us a list of all currently supported clients
 */
import * as AWSClients from 'aws-sdk/clients/all';

/** Yargs is our command line argument parser */
import yargs = require('yargs');

import {
  /**
   * A type definition that extends AwsOrgNode that represents the object
   * passed to our callback function from orgtomate
   */
  ProcessableAccount,

  /**
   * A type definition that represents the credentials object passed
   * to our callback function from orgtomate that we will pass on
   * into the getAwsResults client parameters
   */
  RoleCredentials,

  /**
   * A type definition representing the Role Information we need to
   * pass into orgtomate for it to assume in each account
   */
  RoleInfo,

  /** The orgtomate function */
  orgtomate,
} from './orgtomate';

/** The getAwsResults function that will do all of our AWS API calls */
import { getAwsResults } from './get-aws-results';

/**
 * The results of our regionalPayload function that we will process
 * after Orgtomate executes it everywhere
 *
 * @remarks
 * If we use Orgtomate, We are going to create a custom query that we
 * will execute in every region in every AWS account, and pass that
 * to Orgtomate. Orgtomate will return the results of our callback to
 * us in the same way we created it, just wrapped in Arrays.
 * This type lets us define what we are creating so that we process it
 * the same way when it comes back to us, even though Orgtomate
 * can only process it as an any.
 *
 * If we are not using Orgtomate, we still generate results using the
 * same basic structure, just without the information we don't know
 * as we can't get the account name without AWS Organizations and
 * we can't get the account ID without an unnecessary API call
 */
type RegionalPayloadResult = {
  /** String indexable */
  [index: string]: any;

  /** The AWS Account ID of the payload execution */
  accountId?: string;

  /** The AWS Account Name of payload execution */
  accountName?: string;

  /** The region of the payload execution */
  region: string;

  /** The results block that we get from getAwsResults */
  results: any;
};

/**
 * Respect the AWS approach for region definition from the environment
 * if it's not set, respect the AWS default selection of us-east-1 for SDKs
 * This can still be overridden by command line options
 */
const awsRegion = process.env.AWS_REGION;
const awsDefaultRegion = process.env.AWS_DEFAULT_REGION;
const defaultRegion = awsDefaultRegion || awsRegion || 'us-east-1';

/**
 * If we're invoking orgtomate, we need all of these set
 * these represent defaults for AWS Organizations, but ought
 * to be customised in a correctly secured Organization
 */
const roleDurationSeconds = process.env.ROLE_DURATION_SECONDS || 900;
const roleExternalId = process.env.ROLE_EXTERNAL_ID || undefined;
const roleName = process.env.ROLE_NAME || 'OrganizationAccountAccessRole';
const roleSessionName = process.env.ROLE_SESSION_NAME || 'orgtomate-cli';

/**
 * The Arguments we will get from Yargs
 *
 * @internal
 */
interface Arguments {
  [index: string]: unknown;
  r: Array<string | number> | undefined;
  regions?: Array<string | number>;
  f: string | undefined;
  format?: string;
  c: Array<string | number> | undefined;
  'client-args'?: Array<string | number>;
  a: Array<string | number> | undefined;
  'operation-args'?: Array<string | number>;
  j: boolean;
  'args-as-json'?: boolean;
  k: string | undefined;
  'result-key'?: string;
  m: string | undefined;
  'management-account'?: string;
  o: string | undefined;
  orgtomate?: string;
  y: boolean;
  recurse?: boolean;
  n: string | undefined;
  'role-name'?: string;
  e: string | undefined;
  'external-id'?: string;
  s: string | number | undefined;
  'session-duration'?: string | number;
  x: string | undefined;
  'session-name'?: string;
  d: boolean;
  debug?: boolean;
  _: (string | number)[];
  $0: string;
}

/** The implementation of Arguments by Yargs */
const options: Arguments = yargs
  .usage(
    'Usage: org <service> <operation> -c <service key=val> <service key=val> -a <operation key=val> <operation key=val> -o <orgtomate target> -r <region> <region> -k <result key>',
  )
  .option('r', {
    alias: 'regions',
    type: 'array',
    default: [defaultRegion],
    describe: 'List of regions to execute queries against. Defaults to AWS_DEFAULT_REGION/AWS_REGION from environment',
    demandOption: true,
  })
  .option('f', {
    alias: 'format',
    type: 'string',
    default: 'flat',
    describe: "Output format. Can be: 'flat', 'full', 'regions', 'accountids', 'accountnames'",
    choices: ['flat', 'full', 'regions', 'accountids', 'accountnames'],
  })
  .option('c', {
    alias: 'client-args',
    type: 'array',
    describe: 'Arguments for the API Client Constructor: key1=value1 key2=value2',
  })
  .option('a', {
    alias: 'operation-args',
    type: 'array',
    describe: 'Arguments for the API Client Operation: key1=value1 key2=value2',
  })
  .option('j', {
    alias: 'args-as-json',
    type: 'boolean',
    default: false,
    describe: 'Whether to parse client and constructor arguments as JSON',
  })
  .option('k', {
    alias: 'result-key',
    type: 'string',
    describe: 'Optional Result Key from the API Response',
  })
  .option('m', {
    alias: 'management-account',
    type: 'string',
    describe: 'AWS Account ID of the Management Account',
  })
  .option('o', {
    alias: 'orgtomate',
    type: 'string',
    describe: '"Root" or ID of an Organizations Object (Root, Organizational Unit or Account)',
  })
  .option('y', {
    alias: 'recurse',
    type: 'boolean',
    default: true,
    describe:
      'Whether to recursively apply to all accounts in the tree below the orgtomate target, or only the accounts directly beneath the target node',
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
  .option('s', {
    alias: 'session-duration',
    type: 'number',
    default: roleDurationSeconds,
    describe: 'Orgtomation Cross Account Role Session Duration',
  })
  .option('x', {
    alias: 'session-name',
    type: 'string',
    default: roleSessionName,
    describe: 'Orgtomation Cross Account Role Session Name',
  })
  .option('d', {
    alias: 'debug',
    type: 'boolean',
    default: false,
    describe: 'Debug Output (to STDERR)',
  })
  .check((argv) => {
    if (argv._.length !== 2) {
      return `Two positional arguments are required: service and operation, i.e. Route53 listHostedZones or EC2 describeInstances. You provided: ${argv._}`;
    }

    if (argv.f) {
      if (!argv.o && (argv.f === 'accountids' || argv.f === 'accountnames' || argv.f === 'regions')) {
        return "Output formats other than 'flat' and 'full' can only be used in conjuction with --orgtomate/-o";
      }
    }

    return true;
  })
  .parseSync();

const { debug } = options;

if (debug) {
  console.error(options);
}

/**
 * A function to handle the errors in the command line execution.
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
 * The main async execution function for the CLI
 *
 * @returns An empty promise
 * @internal
 */
const execute = async () => {
  if (!options._[0]) {
    throw new Error('No Service Provided!');
  }
  const service = options._[0].toString();
  if (debug) {
    console.error(`Service: ${service}`);
  }

  if (!options._[1]) {
    throw new Error('No Operation Provided!');
  }
  const operation = options._[1].toString();
  if (debug) {
    console.error(`Operation: ${operation}`);
  }

  /**
   * Use aws-sdk/client/all to find out all services supported by
   * the version of the aws-sdk we're using, so we can validate
   * if the service requested is supported or not
   */
  if (!Object.keys(AWSClients).includes(service)) {
    console.error('Invalid AWS Service');
    process.exit(1);
  }
  if (debug) {
    console.error(`Service is available in the AWS JS SDK`);
  }

  /** -j/--args-as-json or --no-j/--no-args-as-json */
  const argsAsJson = options['args-as-json'];
  if (debug) {
    console.error(`Client and Operation Arguments parsed as JSON?: ${argsAsJson}`);
  }

  /**
   * Create the parameters that will be fed to the Service Constructor
   * We can't have any idea what type of object this will be, we only
   * know that it will be string indexed
   */
  const clientParams: { [index: string]: any } = {};
  if (options['client-args']) {
    options['client-args'].forEach((element) => {
      const arr = element.toString().split('=');
      if (arr && arr.length === 2) {
        const [clientParamKey, clientParamValue] = arr;
        if (argsAsJson) {
          try {
            clientParams[clientParamKey] = JSON.parse(clientParamValue);
          } catch (error: unknown) {
            if (error instanceof SyntaxError) {
              throw new Error(
                `Operation Argument ${clientParamKey} value is not valid JSON: ${clientParamValue} :: Don't forget to escape string quotes or single-quote your input when using -j/--args-as-json`,
              );
            } else {
              throw error;
            }
          }
        } else {
          clientParams[clientParamKey] = clientParamValue;
        }
      } else {
        throw new Error(`Client Argument parsing error. ${element} should be key=value`);
      }
    });
  }
  if (debug) {
    console.error(`Custom Parameters to the AWS Service constructor: ${JSON.stringify(clientParams, null, 2)}`);
  }

  /**
   * This is probably the worst bit of fudgery in this code.
   * It is how we can determine which operations the AWS Service
   * requested supports, but the Clients object has to be force-casted
   * to any in order for us to instantiate an unknown service from it
   * and we have to create an instance of the service object so as to
   * query the supported services as they are only available from the
   * instantiated object, not from the service object interface
   */
  if (!(operation in new (<any>AWSClients)[service]()['api']['operations'])) {
    throw new Error(`Service ${service} does not support operation ${operation}`);
  }
  if (debug) {
    console.error(`Service ${service} supports operation ${operation}`);
  }

  /**
   * If the user has passed additional arguments for the operation
   * construct the map that will be passed to the API function call
   * As with client params, we can't know anything about this object
   * other than it's string-indexable
   */
  const operationParams: { [index: string]: any } = {};
  if (options['operation-args']) {
    options['operation-args'].forEach((element) => {
      const arr = element.toString().split('=');
      if (arr && arr.length === 2) {
        const [operationParamKey, operationParamValue] = arr;
        if (argsAsJson) {
          try {
            operationParams[operationParamKey] = JSON.parse(operationParamValue);
          } catch (error: unknown) {
            if (error instanceof SyntaxError) {
              throw new Error(
                `Operation Argument ${operationParamKey} value is not valid JSON: ${operationParamValue} :: Don't forget to escape string quotes or single-quote your input when using -j/--args-as-json`,
              );
            } else {
              throw error;
            }
          }
        } else {
          operationParams[operationParamKey] = operationParamValue;
        }
      } else {
        throw new Error(`Operation Argument parsing error. ${element} should be key=value`);
      }
    });
  }
  if (debug) {
    console.error(`Custom Parameters to the ${operation} operation: ${JSON.stringify(operationParams, null, 2)}`);
  }

  /** If we have been passed a resultKey it will get passed directly into getAwsResults */
  const resultKey: string | undefined = options['result-key'] || undefined;
  if (debug) {
    console.error(`Result Key: ${resultKey}`);
  }

  /**
   * By default, do not use Orgtomate - just run on the local account
   * but do it much more quickly than the Python AWS CLI ;-)
   */
  let useOrgtomate = false;
  let targetId;

  /**
   * Oooo we *are* going to Orgtomate!
   * Let's pass in our target AWS Organizations node
   * which by default is the ROOT node
   */
  if (options.orgtomate) {
    useOrgtomate = true;

    if (options.orgtomate !== 'Root') {
      targetId = options.orgtomate;
    }
  }

  /**
   * Get our regions from the user. If the user didn't
   * specify one or more regions, we'll just work in the one we have
   */
  if (!options.regions) {
    throw new Error('Regions not Defined');
  }
  const regions: Array<string> = [];
  options.regions.forEach((region) => {
    regions.push(region.toString());
  });
  if (debug) {
    console.error(`Regions: ${regions}`);
  }

  /** Get our console output format preference from options */
  if (!options.format) {
    throw new Error('Format not Defined');
  }
  const outputFormat = options.format;
  if (debug) {
    console.error(`Output Format: ${outputFormat}`);
  }

  /** Here we go! */
  let results: Array<RegionalPayloadResult>;

  /**
   * Using Orgtomate means a completely different approach that without it
   * with orgtomate we need to configure our callback. Without, all we need
   * is a getAwsResults call
   */
  if (useOrgtomate) {
    if (debug) {
      console.error(`Using Orgtomate`);
    }

    /**
     * Set up the Cross Account Role configuration for Orgtomation
     * Even though we would like everyone to follow best practice and
     * use an ExternalId, the default AWS Organizations setup doesn't
     * have one, an we can't hold that against users by requiring it
     */
    if (!options['session-duration'] || !options['role-name'] || !options['session-name']) {
      throw new Error('Role Info is incomplete');
    }
    const roleInfo: RoleInfo = {
      durationSeconds: parseInt(options['session-duration'].toString(), 10),
      externalId: options['external-id'] || undefined,
      name: options['role-name'],
      sessionName: options['session-name'],
    };

    if (debug) {
      console.error(`Role Information: ${JSON.stringify(roleInfo, null, 2)}`);
    }

    /** -y/--recurse or --no-y/--no-recurse */
    const { recurse } = options;
    if (debug) {
      console.error(`Recurse?: ${recurse}`);
    }

    /**
     * This is the async callback function we are going to run in parallel
     * against every AWS Account we are targeting
     *
     * @remarks
     * Orgtomate will send us a creds object and an awsOrgNode object
     * for the cross account role credentials to use and the
     * account we are going to operate on. We don't have to use
     * the awsAccount object, but it's the only way for our callback
     * to know where it is executing if we want that information for
     * any reason in our code. The credentials object must be passed
     * into any API call we make, whether via getAwsResults or not
     * so that our call will be made in the correct target account
     *
     * *NOTE:* Any errors thrown inside this callback will not
     * be treated as fatal. The error will be logged to the console
     * and the output will be chomped from the final result inside
     * Orgtomate.procesAccount. This allows one account to fail
     * without affecting the availability of results from the others.
     *
     * @param credentials - A RoleCredentials object passed in from orgtomate
     * @param awsAccounts - A ProcessableAccount object passed in from orgtomate
     * @returns A promise to return an array of RegionalPayloadResult objects
     * from our regional payload function
     * @internal
     */
    const orgtomateCallback = async (
      credentials: RoleCredentials,
      awsAccount: ProcessableAccount,
    ): Promise<Array<RegionalPayloadResult>> => {
      /**
       * The function block to be executed in every region in every account
       *
       * @remarks
       * Because we're greedy, let's set up another function payload
       * so that we can run the command in multiple regions in parallel
       * as well as multiple accounts in parallel.A
       *
       * This is where the actual code we're going to run in each account
       * is going to sit. While it is orgtomate's responsibility to execute
       * a block of code in every account, it's not orgtomate's responsibility
       * to do it across regions. We do that ourselves here.
       *
       * @param region - The region we're operating in inside this payload
       * @returns A promise to return an instance of Our custom type definition
       * of a Regional Payload Result that standardises how we will create and
       * then process the results we are getting from each region in each account
       * @internal
       */
      const regionalPayload = async (region: string): Promise<RegionalPayloadResult> => {
        if (debug) {
          console.error(`Processing Account: ${awsAccount.Name} (${awsAccount.Id}) in region: ${region}`);
        }

        /*
         * Set up the parameters that will be sent to the AWS Service constructor in getAwsResults
         * Precedence is critical here, so that the caller can override the region or credentials
         * the constructor uses with a custom client parameter of their own
         */
        const regionalClientParams = { credentials, region, ...clientParams };

        /** FINALLY execute our AWS API call */
        const awsResults = await getAwsResults(
          service,
          operation,
          regionalClientParams,
          operationParams,
          resultKey,
        ).catch((error: unknown) => {
          throw error;
        });

        /**
         * We have to return all of this information here. All of the function executions
         * down to this level are parallelised asynchronous Promises, and the results
         * are all just lists of result objects. Once all of the results have been collated
         * the contents of this object are all that determine which results belong to which
         * account and region. We technically could look up the name later from the ID
         * but adding the name here, since we have it in the AwsOrgNode object makes parsing
         * the output so much easier.
         */
        const regionalPayloadResult: RegionalPayloadResult = {
          accountId: awsAccount.Id,
          accountName: awsAccount.Name,
          region,
          results: awsResults,
        };

        return regionalPayloadResult;
      };

      /**
       * Map one regionalPayload function to each region
       * we have been configured to run against in this account
       */
      const regionalTasks = regions.map(regionalPayload);

      /**
       * Execute the regional payloads on all regions in parallel
       * for the account we are running against
       */
      const regionalTaskResults: Array<RegionalPayloadResult> = await Promise.all(regionalTasks).catch(
        (error: unknown) => {
          throw error;
        },
      );

      /** Return our Array of RegionalPayloadResult objects */
      return regionalTaskResults;
    };

    /**
     * FINALLY execute orgtomate, passing in our callback, role information and the target
     * accounts we want orgtomate to operate on, and have it return to us the results we asked for
     * as the RegionalPayloadResult type we created them as, buried in an Array per AWS Account
     * containing an Array per region
     */
    if (debug) {
      console.error(`Invoking Orgtomate...`);
    }
    const allResults: Array<Array<RegionalPayloadResult>> = await orgtomate(
      orgtomateCallback,
      roleInfo,
      targetId,
      recurse,
      options['management-account'],
    ).catch((error: unknown) => {
      throw error;
    });

    if (debug) {
      console.error(`Orgtomation complete. Processing results...`);
    }

    /** Flatten the results for processing into a single Array<RegionalPayloadResult> */
    results = allResults.flat();
  } else {
    /** No Orgtomate, Denied! */
    if (debug) {
      console.error(`Not using Orgtomate`);
    }

    /**
     * The regionalPayload for the call we are parallelising across all requested regions
     *
     * @remarks
     * We're still going to allow for parallelisation of a local CLI call across
     * multiple regions at once, just another benefit we have over the AWS CLI
     * Use the same regionalPayload approach as if we had orgtomated.
     *
     * @param region - The region the payload will execute in
     * @returns A promise to return a Regional Payload Result
     * @internal
     */
    const regionalPayload = async (region: string): Promise<RegionalPayloadResult> => {
      if (debug) {
        console.error(`Processing region: ${region}`);
      }

      /**
       * Set up the parameters that will be sent to the AWS Service constructor in getAwsResults
       * Precedence is critical here, so that the caller can override the region
       * the constructor uses with a custom client parameter of their own
       */
      const regionalClientParams = { region, ...clientParams };

      /** FINALLY execute our AWS API call */
      const awsResults = await getAwsResults(
        service,
        operation,
        regionalClientParams,
        operationParams,
        resultKey,
      ).catch((error: unknown) => {
        /**
         * We could maybe be a little more chill here, and instead of throwing an error
         * for a failure in one region, just drop the error on the console and
         * still try to return the results for the other regions like Orgtomate
         * does for each account, but this is an executive decision that if you
         * are running a call in one account, any exceptions you're going to cause
         * in one region you are probably going to cause in another region
         * and it's reasonable to assume that anyone making a multi-region
         * call in a single account needs all the regional results to succeed
         * for the output to be correct and useful.
         *
         * Change my mind.
         */
        throw error;
      });

      const regionalPayloadResult: RegionalPayloadResult = {
        region,
        results: awsResults,
      };

      if (debug) {
        console.error(`Operation complete. Processing results...`);
        console.error(regionalPayloadResult);
      }
      return regionalPayloadResult;
    };

    /** Parallelise the payload execution across each requested region */
    const regionalTasks = regions.map(regionalPayload);
    results = await Promise.all(regionalTasks).catch((error: unknown) => {
      throw error;
    });
  }

  /**
   * BOOM. We have our results. Now if only we knew what to do with them(!)
   */

  /**
   * A function to rearrange an Array of RegionalPayloadResults into an output
   * format that suits the needs of the user
   *
   * @param resultsToArrange - The Array of RegionalPayloadResult objects to arrange
   * @param arrangementMethod - The method to use to rearrange the results
   * @param resultsResultKey - The resultKey that was sent into the getAwsResults calls, if defined
   * which makes a significant difference to what the results objects look like
   * and therefore how we can process them. Technically we could access this directly
   * in scope as resultKey, but it just feels saner to let this function manage
   * its own scope and send a value into it. Especially if we move this function.
   * @returns A string-indexed Object that contains our rearranged results
   * @internal
   */
  const arrangeResultsBy = (
    resultsToArrange: Array<RegionalPayloadResult>,
    arrangementMethod: string,
    resultsResultKey: string | undefined,
  ): { [index: string]: any } => {
    if (debug) {
      console.error(`Arranging results by: ${arrangementMethod}...`);
    }

    /**
     * Set up the returnable object to fill in with results
     *
     * This would be a const except for the Unexpected Single Item Instead of Array condition
     */
    let arrangedOutput: { [index: string]: any } = {};

    /**
     * Iterate each of the RegionalPayloadResult objects and
     * inject a formatted version into the output object
     */
    resultsToArrange.forEach((regionalPayloadResult) => {
      /** Typescript-enforced safety and did we get any results anyway? */
      if (regionalPayloadResult && regionalPayloadResult.results) {
        /** Flattening the results is completely different to rearranging them */
        if (arrangementMethod === 'flat') {
          /** If a resultKey was used, the results are easier to flatten as we have no metadata to merge */
          if (resultsResultKey) {
            if (!arrangedOutput[resultsResultKey]) {
              arrangedOutput[resultsResultKey] = [];
            }
            if (regionalPayloadResult.results instanceof Array) {
              /**
               * We know we have only one key in our results blocks, and it contains an Array
               * so we can just merge all the values from all the blocks into one single block
               * of the same key. Nice and neat.
               */
              regionalPayloadResult.results.forEach((regionalPayloadResultValue: any) => {
                arrangedOutput[resultsResultKey] = arrangedOutput[resultsResultKey].concat(regionalPayloadResultValue);
              });
            } else {
              /** The regionalPayloadResult results key was not an Array of objects just a single solitary object obtained with a resultKey */
              arrangedOutput[resultsResultKey].push(regionalPayloadResult.results);
            }
          } else if (regionalPayloadResult.results instanceof Array) {
            /**
             * resultKey was not used; therefore there's potentially lots of keys in the object
             * including potentially multiple keys from the AWS API (especially if we're dealing with
             * S3 objects, but also metadata about the call such as getAwsResults's custom PaginationMetadata
             * key and operation parameters, and pagination tokens.
             *
             * Since the user didn't ask for a specific key, lets give them everything, just merge
             * all object values for each key that exists into one array of the same key name
             */
            Object.entries(regionalPayloadResult.results).forEach(([key, value]) => {
              if (!arrangedOutput[key]) {
                arrangedOutput[key] = [];
              }
              arrangedOutput[key] = arrangedOutput[key].concat(value);
            });
          } else {
            if (Object.keys(arrangedOutput).length === 0) {
              arrangedOutput = new Array<any>();
            }
            arrangedOutput.push(regionalPayloadResult.results);
          }
        } else {
          /** So we are definitely re-arranging these results, not just flattening them */

          /** Let's check the key we've been asked to index results by exists in the first result we have */
          if (arrangementMethod in Object.keys(regionalPayloadResult)) {
            throw new Error(`Account did not have key ${arrangementMethod} to arrange by: ${regionalPayloadResult}`);
          }
          const arrangementKey = regionalPayloadResult[arrangementMethod];

          /** As with the flattening operation, it's a lot easier if a resultKey was used */
          if (resultsResultKey) {
            if (!arrangedOutput[arrangementKey]) {
              arrangedOutput[arrangementKey] = { [resultsResultKey]: [] };
            }

            if (regionalPayloadResult.results instanceof Array) {
              /**
               * For each regionalPayloadResult, we are going to ensure there is a top level
               * index for each value we find for that key, i.e. each region we have results
               * for it if the key is regions. Then in each one, concatenate all the results values
               * for each regionalPayloadResult's resultKey into one object which will
               * give us one result key per index containing all of the results that
               * match that index
               */
              regionalPayloadResult.results.forEach((regionalPayloadResultValue: any) => {
                arrangedOutput[arrangementKey][resultsResultKey] =
                  arrangedOutput[arrangementKey][resultsResultKey].concat(regionalPayloadResultValue);
              });
            } else {
              arrangedOutput[arrangementKey][resultsResultKey].push(regionalPayloadResult.results);
            }
          } else {
            /**
             * No resultKey, just splattergun all of the result values for all of the keys
             * into a single array of the same key for each of the indices we're arranging by
             */
            Object.entries(regionalPayloadResult.results).forEach(([key, value]) => {
              if (!arrangedOutput[arrangementKey]) {
                arrangedOutput[arrangementKey] = { [key]: [] };
              } else if (!arrangedOutput[arrangementKey][key]) {
                arrangedOutput[arrangementKey][key] = [];
              }

              arrangedOutput[arrangementKey][key].push(value);
            });
          }
        }
      }
    });

    if (debug) {
      console.error(`Output arranged`);
    }

    /** Phew! */
    return arrangedOutput;
  };

  /**
   * We have our results. We can do whatever we want with them.
   * If we're asked to arrange them, arrange them, or we can
   * just return them as is.
   */
  let consoleOutput: any;
  switch (outputFormat) {
    case 'flat':
      consoleOutput = arrangeResultsBy(results, 'flat', resultKey);
      break;
    case 'regions':
      consoleOutput = arrangeResultsBy(results, 'region', resultKey);
      break;
    case 'accountids':
      consoleOutput = arrangeResultsBy(results, 'accountId', resultKey);
      break;
    case 'accountnames':
      consoleOutput = arrangeResultsBy(results, 'accountName', resultKey);
      break;
    case 'full':
      consoleOutput = results;
      break;
    default:
      throw new Error('Invalid output format');
  }

  if (debug) {
    console.error(`Printing Output to STDOUT as JSON.stringify(consoleOutput, null, 2)`);
  }

  /** This is how I like my results. Give me a reason to make this customisable */
  console.log(JSON.stringify(consoleOutput, null, 2));
};

/**
 * If executing from the CLI, run the execute function.
 * I mean, this *is* a CLI so I don't know why you wouldn't
 * but we still need to call execute() from here because
 * it's async.
 */
if (require.main === module) {
  execute().catch((error: unknown) => {
    _die(error);
  });
}
