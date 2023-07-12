# Orgtomate and the Org CLI

Documentation hosted on GitHub Pages: <https://bjsscloud.github.io/orgtomate-js>

Orgtomate is a TypeScript project designed to help AWS Organizations administrators perform tasks in parallel across multiple regions and accounts, as well as being a faster implementation of the basic functionality of the Python-based AWS CLI.

Orgtomate provides two core capabilities:
 * A command line interface for running single commands in parallel across accounts and regions.
 * Importable libraries for:
   * Executing a callback function in parallel across accounts and regions.
   * Representing part or all of an AWS Organization or as a self-populating tree object.
   * Automatically paginating any paginatable AWS API call using native pagination capabilities in the AWS SDK.

The Orgtomate package's executable code is distributed as minified (uglified) JavaScript for maximum execution speed, with associated TypeScript definition files and Source Maps. The source code is freely available under the MIT licence on GitHub: <https://github.com/bjsscloud/orgtomate-js>


## Org - The Command Line Interface

The Orgtomate Command Line Interface (Org) is similar to the Official AWS CLI, but it exposes the raw nerves of the AWS SDK for JavaScript to the user. The commands and parameters are passed exactly as provided by the user to the AWS SDK and the results are only available in JSON format. This gives the user as much control as possible, and requires almost no maintenance in order to support the latest features and services in the SDK. Just as you might write `const r = new AWS.Route53({maxRetries: 10}); const z = await r.listHostedZones(maxItems="5");` in JavaScript, the equivalent parameters to Org are the same: `org Route53 listHostedZones -c maxRetries=10 -a maxItems=5`.

One of the most notable features of Org as a stanalone AWS CLI alternative is the ability to run commands in multiple AWS Regions simply by passing multiple regions as command line options. As these calls are executed in parallel, the additional time required to query multiple regions is negligable. Results are presented by default in flat format, producing results from all regions as if they had been one region. Alternatively results can be presented in an object indexed by region, or as a list of objects containing region and results keys.

Org also provides the advantage of integrating with the AwsOrgNode, Orgtomate and GetAwsResults modules in the Orgtomate package. They make it simple to run commands in multiple AWS accounts as well as multiple regions. GetAwsResults ensures that all paginatable calls are automatically paginated for you. Orgtomate provides the means to assume an Organizations Cross-Account role in each target account and run commands on them all in parallel, and AwsOrgNode provides an extension to the Organizations API, loading the Organization into a tree structure so that Organizations relationships can be easily determined, and in local execution rather than combinations of unique API calls.

The result is a single command that can seamlessly and efficiently gather information from, or make changes to, every account and region you control.


### Installation

* Requires: [NodeJS](https://nodejs.org/) >=12.0.0

```bash
$ npm install -g orgtomate
or
$ yarn global add orgtomate
```  


### Usage

```bash
org <service> <operation> \
  [-c|--constructor-args <key>=<value> ...] \
  [-a|--operation-args <key>=<value> ...] \
  [-j|--args-as-json|--no-j|--no-args-as-json] \
  [-o|--orgtomate <target>] \
  [-m|--management-account <AWS Account ID>] \
  [-y|--recurse|--no-y|--no-recurse] \
  [-r|--regions <region> ...] \
  [-k|--result-key <key>] \
  [-f|--format [flat|full|regions|accountids|accountnames]] \
  [-n|--role-name <role-name>] \
  [-e|--external-id <external-id>] \
  [-s|--duration-seconds <seconds>] \
  [-x|--session-name <session-name>] \
  [-d|--debug|--no-d|--no-debug]
```  

Usage of the org command is detailed in the man page:

* Org man page (HTML) <https://bjsscloud.github.io/orgtomate-js/pages/Commands/org.html>
* Org man page (Markdown) in Source: <https://github.com/bjsscloud/orgtomate-js/blob/master/src/docs/org.1.md>
* Org man page (roff) in NPM Module: [dist/man/org.1.gz](dist/man/org.1.gz)

The man page should be installed by default by npm or yarn, however both tools have recently suffered significant issues with installing man pages. If `man 1 org` does not work on your system, the manpage should still be available in its installation directory: e.g. `man /usr/lib/node_modules/orgtomate/dist/man/org.1.gz`

### Examples

There are two image links per example as the relative path may be different depending on whether you are viewing this README.md from the repository root or GitHub Pages.

#### Comparing Speed: AWS CLI vs. Orgtomate

![listHostedZones Time Comparison](docs/orgtomate-listHostedZones-comparison.gif "listHostedZones Time Comparison")

#### Route53 List Hosted Zones - One Account

![listHostedZones](docs/orgtomate-listHostedZones.gif "listHostedZones")

#### Route53 Count Hosted Zones - All Accounts

![listHostedZones Root Count](docs/orgtomate-listHostedZones-root-count.gif "listHostedZones Root Count")

#### Route53 List Hoseted Zones - Organizational Unit - Full Output

![listHostedZones Targeted Full](docs/orgtomate-listHostedZones-target-full.gif "listHostedZones Targeted Full")

#### EBS Encryption By Default - Multi-Account Multi-Region Format Options

![Multi-Account Multi-Region Format Options](docs/orgtomate-multi-region-format-options.gif "Multi-Account Multi-Region Format Options")

## The Modules

As powerful as Org is as a CLI, the power is supplied by the modules in the Orgtomate package. They are designed to work together, and alone as utilities for AWS administrators and developers who use TypeScript or JavaScript to interact with AWS from custom applications and Lambda Functions.

All modules are designed to be compatible with the latest version of the [AWS SDK for JavaScript version 2](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/). The newly-GA [version 3 SDK](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/index.html) is a significant change in design approach, and will take some time to adapt to once it is fully adopted and supported by all services. There are some details that may present a challenge to the design of Orgtomate.

All modules are documented using [TypeDoc](https://typedoc.org), to the [TSDoc](https://tsdoc.org/) standard, and as such the most detailed documentation is available on-line in HTML format: <https://bjsscloud.github.io/orgtomate-js/modules.html>, generated from the documentation in the source code.


### Index

While it is recommended that individual types, interfaces, classes and functions are imported as they are required; an index module is provided that re-exports all public items from all modules:


#### Usage

##### TypeScript

```typescript
import * as Orgtomate from 'orgtomate';
```  

##### JavaScript

```javascript
const Orgtomate = require('orgtomate');
```  


##### Exports

* AwsOrgNode
  * Class & Interface: AwsOrgNode
* GetAwsResults
  * Function: getAwsResults
  * Type: PaginationMetadata
* Orgtomate
  * Class & Interface: ProcessableAccount
  * FUnction: orgtomate
  * Type: AssumeRoleConfig
  * Type: AsyncCallbackFunction
  * Type: RoleCredentials
  * Type: RoleInfo


### AwsOrgNode

The purpose of this module is to provide a class and interface that describe an AwsOrgNode object. This object represents an AWS Organization Root, Organizational Unit or Account, and a tree of Child objects of the same class. The normal use case is to initialise a Root or Organizational Unit AwsOrgNode, which will recursively initialise every other AwsOrgNode beneath it in the AWS Organizations tree.

The result will be a tree of objects whose information and relationships can be queried in-memory without additional API calls. The methods implemented by AwsOrgNode permit the inference of relationships between nodes that might normally require more than one chained call to the Organiztions API with custom parameters. For example, retrieving all of the parent Organiztional Units of an AWS Account up to and including, or not including, the Root.

Because AWS API calls must usually be made in async functions, it's implausible to initialise an AwsOrgNode object in its constructor. Therefore AwsOrgNode provides a static initialisation function that returns an async result. It is expected that a new AwsOrgNode object will be created directly by this static function and not by the constructor. One calls AwsOrgNode.init() and the result will be an AwsOrgNode object (or void).

Use of AwsOrgNode should be a choice that balances performance with utility. The larger the tree or subtree you are initialising, the longer the initialisation will take. Initialising a tree of thousands of AWS Accounts in hundreds of Organizational units might take tens of seconds and at least as many API calls as there are Organizational Units; however the value to the subsequent logic may make that investment worthwhile. As much effort as possible has been put into streamlining the initialisation process, using the listAccounts operation to save individual describeAccount calls for each nested account's data and not performing a describeOrganizationalUnit unless there is missing data from the init function parameters.

As an example of this choice, Orgtomate does not always initialise an AwsOrgNode. If the target is the Root of an AWS Organization and the recursive option is selected, Orgtomate will perform a listAccounts call and operate solely on the results of that call, as it is not necessary to initialise an AwsOrgNode tree to collect that information. Future improvements will further increase the logic in the targeting process to make maximum use of singular AWS Organizations operations, especially as new ones are made available, relying on AwsOrgNode only where a single method would replace multiple API calls or complex iteration.

Should a developer require any complex inference of AWS Organization relationships that are not fulfilled by the AWS API or AwsOrgNode, the AwsOrgNode object can be extended to provide additional methods or properties, as is done in Orgtomate to extend an AwsOrgNode into a ProcessableAccount.

AwsOrgNode takes the optional skipSuspended paremeter to not include AWS Accounts in a SUSPENDED state when populating the tree, as suspended accounts are often completely irrelevant.


#### Export

```typescript
static init(orgNode: AwsOrgNode = new AwsOrgNode(), skipSuspended = false, orgAccounts: Array<AwsOrgNode> = []): Promise<AwsOrgNode>
```  

#### Usage

```typescript
import { AwsOrgNode } from 'orgtomate';
const awsOrg: AwsOrgNode | void = await AwsOrgNode.init().catch((error: unknown) => { throw error; });
```  


### GetAwsResults

This module provides a function designed to replace any call to the AWS API through an AWS Service constructor and operation. It is not a universal panacea, but should be usable in almost any regular use case. Instead of importing the AWS SDK, setting constructor parameters, creating an AWS Service object, setting operation parameters, awaiting a promise to return a single page of results, and then repeating the call based on per-service custom tokenisation data, you can simply make one call to the getAwsResults function. You pass strings for the AWS Service and Operation you wish to perform, config objects for custom parameters for each of them, and an optional result key.

The function will do the rest of the work. It will configure the constructor, set up an AWS Request object for the Service, create a recursive on-success event listener and then send the request. The event listener will, on receipt of a successful result, make use of the hasNextPage() and nextPage() functions of the AWS Response object to create a new Request with its own on-success event listener for another results page and repeat until none remain. This process is wrapped in a Promise, such that the whole function can be awaited, providing the same async/await interface to requests that JavaScript developers have come to rely on.

Whether a result key is specified or not, all results from all pages of a paginated result will be concatenated together. Each key in a result will contain all of the values produced for that key in each Request. The specification of a result key will select only one key in each response, and concatenate only those results, which for most AWS API calls is all of the information required.

Along with the results from the AWS Response, getAwsResults adds a key called PaginationMetadata which is an Object with three properties: Pageable, Paged and Pages, containing information as to whether the result was pageable, whether paging was necessary, and how many pages made up the result respectively.


#### Export

```typescript
export const getAwsResults = async (
  service: string,
  operation: string,
  clientParams: any = {},
  operationParams: any = {},
  resultKey: string | undefined = undefined,
) => Promise<any>
```  

#### Usage
```typescript
import { getAwsResults } from 'orgtomate';
const hostedZones: Array<any> = getAwsResults('Route53', 'listHostedZones', {}, {}, 'HostedZones');
```  


### Orgtomate

This module provides a function that takes a starting point in an AWS Organization, and a callback function, and runs the callback against every Child AWS Account in the tree that is not in a SUSPENDED state, recursively or not.

The callback function receives two parameters, a credentials object and ProcessableAccount (extends AwsOrgNode). 

The credentials object contains credentials in the form expected by an AWS Service constructor, unique for each execution of the callback across each AWS Account being Orgtomated. The credentials object can be passed directly into an AWS Service constructor (or to getAwsResults) to make calls using the assumed role for the target account.

The ProcessableAccount object is an AwsOrgNode object containing information about the AWS Account being Orgtomated so that values such as its name and AWS Account ID can be easily referenced in the function. The object also contains an AssumeRoleConfig object containing information about the role that was assumed in the account, and a copy of the AsyncCallbackFunction itself.

The function returns a Promise (that should be awaited) containing an Array. The Array contains one result object for each of the callbacks that ran in the target accounts. Any failures to assume a role or execute a function will not be treated as fatal. An error will be printed to console.error (STDERR), and the null result will be chomped from the resulting Array such that the Array only contains results from successful executions.

Orgtomate is entirely agnostic of the object that is returned by the callback, therefore the developer may return any suitable object in the callback, and then process the Array of objects in any appropriate manner. It is advisable that the result object contain at least the AWS Account ID from the ProcessableAccount object so that each result block may uniquely identify the account it was executed in.

Orgtomate does not provide native capabilities for repeating the callback in multiple regions. This is not Orgtomate's responsibility, nor would it be appropriate in a generic impementation since so many AWS services are not regional. If the developer wishes to parallelise callback execution in multiple regions, it can be achieved easily in the same manner as done by Org and as in the example below.


#### Export

```typescript
export const orgtomate = async (
  asyncCallback: AsyncCallbackFunction,
  roleInfo: RoleInfo,
  targetId: string | null = null,
  recursive = false,
): Promise<Array<any>>
```  


#### Usage

```typescript
const roleInfo: RoleInfo = {
  name: roleName,
  sessionName: roleSessionName,
  externalId: roleExternalId,
  durationSeconds: roleDurationSeconds,
};

const asyncCallback: AsyncCallbackFunction = async (credentials, awsAccount) => {
  const arn = await getAwsResults('STS', 'getCallerIdentity', { credentials }, {}, 'Arn').catch((error: unknown) => { throw error; });
  return arn;
};

const results = await orgtomate(asyncCallback, roleInfo, 'Root', true).catch((error: unknown) => { throw error; });
```  


#### Parallelised Regions Example
```typescript
const orgtomateCallback = async (credentials: RoleCredentials, awsAccount: ProcessableAccount): Promise<Array<RegionalPayloadResult>> => {
  const regionalPayload = async (region: string): Promise<RegionalPayloadResult> => {
    const regionalClientParams = { credentials, region };
    const awsResults = await getAwsResults(service, operation, regionalClientParams, operationParams, resultKey).catch((error: unknown) => { throw error; });

    const regionalPayloadResult: RegionalPayloadResult = {
      accountId: awsAccount.Id,
      accountName: awsAccount.Name,
      region,
      results: awsResults,
    };

    return regionalPayloadResult;
  };

  const regionalTasks = regions.map(regionalPayload);
  const regionalTaskResults: Array<RegionalPayloadResult> = await Promise.all(regionalTasks).catch((error: unknown) => { throw error; });
  return regionalTaskResults;
}
```  


#### Paginate

There is an additional module that is not an official part of the package called Paginate. It is a deprecated version of GetAwsResults that uses a complex and incomplete approach to automatic AWS Response pagination, along with a semi-automatic mechanism requiring the user to provide pagination configuration for the service and operation. It has been left in the package for educational and reference purposes.


## Development

This project uses: [TypeScript](https://www.typescriptlang.org/), [ESLint](https://eslint.org/), [TypeDoc](https://typedoc.org), [Gulp](https://gulpjs.com), [Yarn](https://yarnpkg.com/), [Prettier](https://prettier.io/) and associated tool plugins for its development processes.

### Development Dependencies

Install development dependencies with yarn:

```bash
$ npm install -g yarn
$ yarn install
```  

### Documentation

All code is documented to the [TSDoc](https://tsdoc.org/) standard, with the exception of `@module` and `@includeDoc` tags which are not defined in TSDoc, but are implementations in TypeDoc, the tool used to generate the documentation. TypeDoc existed before TSDoc, and therefore does not, or does not yet, completely adhere to the standard. The TSDoc syntax is validated in ESLint using the [eslint-plugin-tsdoc](https://github.com/microsoft/tsdoc/tree/master/eslint-plugin) plugin, but this is the only ESLint check that is a warning. This is because eslint-plugin-tsdoc does not permit individual rules or tags to be suppressed. All other ESLint checks are configured as 'error' and will fail tests.

The TypeDoc options are configured in the source `tsconfig.json` file in the `src/` directory.

Documentation is built using Gulp, and committed to the `docs/` directory in the repository for hosting on GitHub Pages.

```bash
$ yarn doc
or
$ gulp doc
```

*Tests must pass for documentation to build!*

The Org man page source is located at `src/docs/org.1.md` in Markdown format. The [typedoc-plugin-pages-fork](https://www.npmjs.com/package/typedoc-plugin-pages-fork) plugin is used to incorporate the Org man page in the HTML documentation. This is a fork of [typedoc-plugin-pages](https://github.com/mipatterson/typedoc-plugin-pages) which does not yet support the latest software versions. Gulp also places the file `src/docs/_config.yml` in the documentation root which instructs GitHub pages' [jekyll](https://jekyllrb.com/docs/github-pages/) not to ignore HTML pages beginning with an underscore character.

The Org man page is built from the `src/docs/org.1.md` Markdown file as part of the code compilation process using the [gulp-marked-man](https://github.com/jsdevel/gulp-marked-man) plugin.


### ESLint

ESLint is configured for static code testing. All but eslint-plugin-tsdoc checks are configured as 'error' and will fail the build if non-conformant. A number of existing standard rulesets have been included:

```yaml
extends:
  - airbnb-base
  - eslint:recommended
  - plugin:@typescript-eslint/recommended
  - plugin:prettier/recommended
  - recommended/esnext
  - recommended/esnext/style-guide
  - recommended/node
  - recommended/node/style-guide

plugins:
  - '@typescript-eslint'
  - 'eslint-plugin-tsdoc'
  - prettier
  - import
```  

However a significant number of rules have been customised or disabled to meet either necessary requirements of the code or author style-preference. These rules and the full configuration can be found in the `.eslintrc` file in the project root.

#### [eslint-nibble](https://github.com/IanVS/eslint-nibble)

To ease development, eslint-nibble is used to manage linting failures one-by-one in an interactive format that will offer to automatically fix fixable violations so that the results can be compared individually.

 * `yarn nibble` will process all source files
 * `yarn nibble-one <path>` will process an individual file


### Build

```bash
$ yarn build
or
$ gulp build
```  

*Tests must pass for source to compile!*

Also `gulp build-all` is available for building source and documentation simultaneously for expediency; however normally documentation and code should be built separately. Code is built only for testing and packaging so that the module can be installed or published to NPM. Documentation must be rebuilt when documentation source is modified in order for GitHub Pages to update.


### Continuous Integration

Currently the only automated pipeline is a GitHub Action for running CodeQL which includes security scanning results in the GitHub security tab, and in branch push feedback.

Implementing ESLint as an automated test on Pull Requests is an outstanding TODO.


### Publish

The NPM module name `orgtomate` is owned by Mike Peachey who is responsible for publishing releases.


### Contributing

Please engage with this project via GitHub.

* Pull Requests: https://github.com/bjsscloud/orgtomate-js/pulls
* Issues: https://github.com/bjsscloud/orgtomate-js/issues
