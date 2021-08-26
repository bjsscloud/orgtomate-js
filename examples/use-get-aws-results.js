#!/usr/bin/env node
// vim: set syntax=typescript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :
'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
const get_aws_results_1 = require("./get-aws-results");
/**
 * @function _die
 * @description Common private function for CLI process failure
 * @private
 * @param {unknown} error A thrown Exception or error string
 * @returns {void}
 */
const _die = (error) => {
    console.error(error);
    process.exit(1);
};
/**
 * @function example
 * @description An example invocation of AwsOrgNode against the Root of the Organization
 * @returns {Promise<void>}
 * @async
 */
const example = async () => {
    console.log(await get_aws_results_1.getAwsResults('STS', 'getCallerIdentity'));
    console.log(await get_aws_results_1.getAwsResults('Organizations', 'listAccounts', { region: 'us-east-1' }, { MaxResults: 10 }));
    console.log(await get_aws_results_1.getAwsResults('Route53', 'listHostedZones', {}, { MaxItems: '2' }));
};
/**
 * If executing from the CLI, call the example function
 */
if (require.main === module) {
    try {
        example();
    }
    catch (error) {
        _die(error);
    }
}
