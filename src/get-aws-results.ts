#!/usr/bin/env node
/** vim: set syntax=typescript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab : */

/**
 * A standardised solution for AWS operation pagination using the AWS Javascript SDKv2
 * that can replace direct interaction with the AWS API with a single function
 *
 * @module
 */

'use strict';

/**
 * The only place in the whole module we really need the whole AWS SDK
 *
 * Mama always said, life was like a box of chocolates; you never know what you're gonna get.
 **/
import * as AWS from 'aws-sdk';

/**
 * Metadata describing the pagination status of the result
 *
 * @public
 */
export type PaginationMetadata = {
  /** Whether the operation is pageable */
  Pageable: boolean;
  /** Whether the result was paged */
  Paged: boolean;
  /** How many pages pageable result was built from */
  Pages?: number;
};

/**
 * Execute an AWS API call just as if you had called the constructor
 * and operation yourself, but automatically paginating any results
 * returned if the SDK has the capability to do so.
 *
 * @param service - The AWS Service Constructor you want to use, in TitleCase, e.g. `Route53` or `EC2`
 * @param operation - The Service operation you want, in camelCase, e.g. `listHostedZones` or `describeInstances`
 * @param clientParams - The Parameters you want to pass to the client constructor, e.g. `{region: 'us-east-1', maxRetries: 100}`
 * @param operationParams - The Parameters you want to pass to the operation, e.g. `{maxItems: '3', Id: <ResourceID>}`
 * @param resultKey - The optional resultKey to pull results from, like passing `--query .<keyName>` to the AWS cli
 * @returns Whatever the AWS API returns, either as the results of a singular key, or with the additional metadata
 * @public
 */
export const getAwsResults = async (
  service: string,
  operation: string,
  clientParams: any = {},
  operationParams: any = {},
  resultKey: string | undefined = undefined,
): Promise<any> => {
  /**
   * We need a new promise to wrap all of the work in. We are not using the promise()
   * capability of the AWS SDK here, we are creating our own AWS Request object so that
   * we can set up a recursive event listener to perform the pagination.
   * The whole process is unpromised event driven callbacks, so the only way we
   * can make sure we have all of our results fulfilled before we return is to wrap
   * the whole shebang in a promise of our own.
   * Therefore any success in the process is returned to us in a resolve()
   * and any errors are caught and thrown out as a reject()
   */
  const requestPromise: Promise<any> = new Promise((resolve, reject) => {
    /** Try so all uncaught exceptions are rejected by the promise */
    try {
      /** Initialise the result object */
      const result: any = {};

      /**
       * Ok, this is ugly, but it's a type-safe as it's possible to be when you have
       * no idea what service is being requested. You're just lucky this isn't the v3 AWS SDK
       * where there's a chance we're going to end up doing an eval so we still be service agnostic
       */
      const client = new (<any>AWS)[service](clientParams);

      /** Initialise our AWS Request object */
      const request = client[operation](operationParams);

      /** Add some handy pagination metadata as an object */
      const pageable: boolean = request.isPageable();
      const paginationMetadata: PaginationMetadata = {
        Pageable: pageable,
        Paged: false,
      };
      result.PaginationMetadata = paginationMetadata;

      /** Set up our event listener functions for handling successes and errors in sending Requests */

      /**
       * On error, reject the promise with the error
       *
       * @param error - An AWS Error object returned from an AWS Request
       * @param response - The AWS Response Generic Object returned from the sending of an AWS Request
       * @returns An empty promise
       * @internal
       */
      const handleError = async (error: AWS.AWSError, response: AWS.Response<any, AWS.AWSError>): Promise<void> => {
        reject(error);
      };

      /**
       * Recursively handle each AWS Response page the same way
       *
       * @param response - The AWS Response Generic Object returned from the sending of an AWS Request
       * @returns An empty promise
       * @internal
       */
      const handlePage = async (response: AWS.Response<any, AWS.AWSError>): Promise<void> => {
        /** Who says the processing of a successful result will be successful? */
        try {
          /** Type saftety, and making sure the API gave us some data */
          if (response.data) {
            const { data } = response;

            /** If this is a pageable operation, let's interrogate for more results */
            if (pageable) {
              /** Update the PaginationMetadata to denote this operation as pageable */
              result.PaginationMetadata.Pageable = pageable;

              /**
               * If this is the first invocation of this recursive handler function
               * initialise the number of pages in the PaginationMetadata as 0
               * ready for incrementing
               */
              if (!result.PaginationMetadata.Pages) {
                result.PaginationMetadata.Pages = 0;
              }

              /** Increment the Pages in the metadata, beginning at 1 for our first page */
              result.PaginationMetadata.Pages += 1;

              /**
               * For all of the data returned from the API call, for each available result key
               * concatenate all values into a single key of the same name in the result object
               */
              Object.entries(data).forEach(([key, value]) => {
                if (!result[key]) {
                  result[key] = [];
                }
                result[key] = result[key].concat(value);
              });

              /** Ask the SDK whether this response was the last one, or if another page is available */
              if (response.hasNextPage()) {
                /**
                 * In our first response, if there is another page, update the pagination metadata
                 * so that the result is identified as a paged result since we're about to ask
                 * for another one. Don't bother doing this on each subsequent recursive call
                 * as we only need to update this object once.
                 */
                if (!result.PaginationMetadata.Paged) {
                  result.PaginationMetadata.Paged = true;
                }

                /** Get the next page from the API */
                const nextPage = response.nextPage();

                /** More type-safety */
                if (nextPage) {
                  /**
                   * Recursive call back to ourselves to handle the next page,
                   * continuing to update the same results object from the parent scope
                   */
                  await nextPage.on('success', handlePage).on('error', handleError).send();
                } else {
                  reject(new Error('response.hasNextPage, but the nextPage is null!'));
                }
              } else if (resultKey) {
                /**
                 * We are the last page, we've finished getting all pages and processing them
                 * Resolve the promise with _only_ the property from the results array
                 * with the same name as the resultKey we were given
                 */
                if (!result[resultKey]) {
                  console.error(
                    `WARNING: ${service}.${operation} result did not contain key resultKey: ${resultKey}. This is not normal. Possible keys: ${Object.keys(
                      result,
                    )}`,
                  );
                }
                resolve(result[resultKey]);
              } else {
                /**
                 * We are the last page, we've finished getting all pages and processing them
                 * Resolve the promise with all of the results we have received and concatenated
                 * each key's values for
                 */
                resolve(result);
              }
            } else {
              /**
               * This operation is not pageable, so we already have all of the possible result.
               * Merge in result data into our metadata-populated result object before we work out
               * what to do with it
               */
              const unpaginateResult = { ...result, ...data };

              if (resultKey) {
                /** If we were asked to just return a resultKey from the data, do so */
                if (!unpaginateResult[resultKey]) {
                  console.error(
                    `WARNING: ${service}.${operation} result did not contain key resultKey: ${resultKey}. This is not normal. Possible keys: ${Object.keys(
                      unpaginateResult,
                    )}`,
                  );
                }
                resolve(unpaginateResult[resultKey]);
              } else {
                /** If not, just return it all */
                resolve(unpaginateResult);
              }
            }
          }
        } catch (error: unknown) {
          /** Throw any failures in the on-success listener function out of the promise as a rejection */
          reject(error);
        }
      };

      /** Just for type-safety, be sure we got a request */
      if (request) {
        /** Set up our success and error event listeners for our event using our custom handler functions and send it */
        request.on('success', handlePage).on('error', handleError).send();
      } else {
        /** Should be impossible, just the result of a broken type-safety check */
        reject(new Error('The request we just constructed doesnt exist?!?'));
      }
    } catch (error: unknown) {
      /** Catch any uncaught exception and reject the promise with it */
      reject(error);
    }
  });

  /** Return the promise for the caller to await until the request is completely fulfilled */
  return requestPromise;
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
 * An example invocation of AwsOrgNode against the Root of the Organization
 *
 * @returns An empty promise
 * @internal
 */
const example = async (): Promise<void> => {
  /** Example 1 */
  console.log(
    await getAwsResults('STS', 'getCallerIdentity').catch((error: unknown) => {
      throw error;
    }),
  );

  /** Example 2 */
  console.log(
    await getAwsResults('Organizations', 'listAccounts', { region: 'us-east-1' }, { MaxResults: 10 }).catch(
      (error: unknown) => {
        throw error;
      },
    ),
  );

  /** Example 3 */
  console.log(
    await getAwsResults('Route53', 'listHostedZones', {}, { MaxItems: '2' }).catch((error: unknown) => {
      throw error;
    }),
  );
};

/**
 * If executing from the CLI, call the example function
 */
if (require.main === module) {
  example().catch((error: unknown) => {
    _die(error);
  });
}
