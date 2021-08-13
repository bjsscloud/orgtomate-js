#!/usr/bin/env node
// vim: set syntax=javascript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :

'use strict';

// Declare a helper function for getting paginated results from
// AWS API calls. Most APIs return a maximum number of results,
// and a pagination token to allow to you make another call for
// the next set of results until no results remain.
// Additionally many APIs use different parameters for the pagination
// token such as nextToken or NextToken.
// This function allows us to make a generic API call, defining the correct
// pagination token for the API call, and retrieving all of the results
//
// Usage:
//   <const|var|let> <results variable name> = await getPaginatedResults(async (NextMarker) => {
//    const <results variable name> = await <api object>.<api function>({NextToken: NextMarker}).promise();
//    return {
//      marker: <results variable name>.<pagination token name for the api>,
//      results: <results variable name>.<api response object containing the values you want>,
//    };
//  });
const getPaginatedResults = async (awsCliFunction) => {
  const EMPTY = Symbol('empty');
  const concatenatedResultsPages = [];

  for await (const lf of (async function*() {
    let paginationTokenValueForRequest = EMPTY;
    let continueLoop = EMPTY;
    while (continueLoop || continueLoop === EMPTY) {
      const requestPaginationTokenValue = continueLoop !== EMPTY ? paginationTokenValueForRequest : undefined;
      const { paginationTokenValueFromResultsPage, resultsFromPage, moreResults } = await awsCliFunction(requestPaginationTokenValue);
      if (!resultsFromPage) { throw new Error("Your function isn't working properly! No resultsFromPage to yield"); }

      yield* resultsFromPage;
      paginationTokenValueForRequest = paginationTokenValueFromResultsPage;
      continueLoop = moreResults === undefined ? paginationTokenValueFromResultsPage : moreResults;
    }
  })()) {
    concatenatedResultsPages.push(lf);
  }

  return concatenatedResultsPages;
};

const paginate = async (config) => {
  try {
    const client    = config.client;
    const operation = config.operation;
    const params    = config.params || {};
    let paginationSettings = config.paginationSettings;

    if (!(operation in client.api.operations)) {
      throw new Error('Invalid Operation. SDK does not support operation ' + operation + ' for service ' + client.api.serviceId);
    }

    // If we've been told not to paginate, don't paginate
    let paginate = config.paginate !== false;

    if (paginate) {
      // No pagination was explicitly specified or we were asked to paginate

      if (!paginationSettings) {
        // No pagination paginationSettings specified, attempt automatic pagination
        const apiOperation = client.api.operations[operation];
        let apiPaginator = {};
        if (apiOperation.paginator) {
          apiPaginator = apiOperation.paginator;

          const requiredPaginationProperties = [
            'inputToken',
            'outputToken',
            'resultKey',
          ];

          if (requiredPaginationProperties.every((paginationProperty) => {
            if (paginationProperty in apiPaginator) {
              const property = apiPaginator[paginationProperty];
              if (property !== undefined && typeof property === 'string' && property.match(/^[A-Za-z]+$/)) {
                return paginationProperty;
              }
            }
            return undefined;
          })) {
            paginationSettings = apiPaginator;
          } else {
            // Automatic Pagination not possible due to incomplete API information;
            paginate = false;
          }
        } else {
          // Automatic Pagination not possible due to missing API information
          paginate = false;
        }
      } else {
        // Manual Pagination has been requested by specifying config['paginationSettings']
      }
    }

    switch (paginate) {
      case true: {
        const res = await getPaginatedResults(async (paginationTokenValueForRequest) => {
          const operationParams = Object.assign({ [paginationSettings.inputToken]: paginationTokenValueForRequest }, params);
          //console.log(`Paginating\n\tclient: ${client.api.serviceId}\n\toperation: ${operation}\n\tparams: ${JSON.stringify(operationParams, null, 2)}\n\tpaginationSettings: ${JSON.stringify(paginationSettings, null, 2)}`);
          const page = await client[operation](operationParams).promise();

          return {
            paginationTokenValueFromResultsPage: page[paginationSettings.outputToken],
            resultsFromPage: page[paginationSettings.resultKey],
            moreResults: paginationSettings.moreResults ? page[paginationSettings.moreResults] : undefined,
          };
        });

        return { [paginationSettings.resultKey]: res };
      }
      case false:
        //console.log(`Not Paginating\n\tclient: ${client.api.serviceId}\n\toperation: ${operation}\n\tparams: ${JSON.stringify(params, null, 2)} :: paginationSettings: ${JSON.stringify(paginationSettings, null, 2)}`);
        return await client[operation](params).promise();
      default:
        throw new Error('Logic error determining whether to paginate results');
    }

  } catch (error) {
    throw error;
  }
};

module.exports = { getPaginatedResults, paginate };

const die = (error) => {
  console.error(error);
  process.exit(1);
};

const example = async () => {
  const aws = require('aws-sdk');
  const paginationConfig = {
    client: new aws.Route53(),
    operation: 'listHostedZones',
    paginationSettings: { inputToken: 'NextToken', outputToken: 'NextToken', resultKey: 'HostedZones' },
  };
  const results = await paginate(paginationConfig)
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
