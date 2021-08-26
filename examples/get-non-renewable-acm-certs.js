#!/usr/bin/env node
// vim: set syntax=javascript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :

/**
 * An example of retrieving a list of AWS ACM Certificates that are
 * not eligible for automatic renewal, but are in use
 */

'use strict';

const { getAwsResults, orgtomate } = require('orgtomate');

/** Get Role Name and decide on regions */
const roleName = process.env.ROLE_NAME;
const roleExternalId = process.env.ROLE_EXTERNAL_ID || undefined;
const regions = ['eu-west-1', 'eu-west-2', 'us-east-1']

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
      const certList = await getAwsResults('ACM', 'listCertificates', regionalClientParams, {CertificateStatuses: ['ISSUED']}).catch((error) => { throw error })

      /** Get an object for each one that is ineligible for renewal, but in use */
      certList.CertificateSummaryList.forEach(async (summary) => {
        const cert = await getAwsResults('ACM', 'describeCertificate', regionalClientParams, {CertificateArn: summary.CertificateArn}).catch((error) => { throw error });

        const { DomainName, NotAfter, InUseBy, RenewalEligibility }  = cert.Certificate

        if (RenewalEligibility !== 'ELIGIBLE' && InUseBy.length > 0) {
          awsResults.push({Domain: DomainName, Expires: NotAfter, UsedBy: InUseBy});
        }

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
