#!/usr/bin/env node
// vim: set syntax=typescript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :

'use strict';

import { getAwsResults } from './get-aws-results';

/**
 * @function _die
 * @description Common private function for CLI process failure
 * @private
 * @param {unknown} error A thrown Exception or error string
 * @returns {void}
 */
const _die = (error: unknown): void => {
  console.error(error);
  process.exit(1);
};

/**
 * @function example
 * @description An example invocation of AwsOrgNode against the Root of the Organization
 * @returns {Promise<void>}
 * @async
 */
const example = async (): Promise<void> => {
  console.log(await getAwsResults('STS', 'getCallerIdentity').catch((error: unknown) => { throw error; }));
  console.log(await getAwsResults('Organizations', 'listAccounts', { region: 'us-east-1' }, { MaxResults: 10 }).catch((error: unknown) => { throw error; }));
  console.log(await getAwsResults('Route53', 'listHostedZones', {}, { MaxItems: '2' }).catch((error: unknown) => { throw error; }));
};

/**
 * If executing from the CLI, call the example function
 */
if (require.main === module) {
  example()
  .catch((error: unknown) => { _die(error); });
}
