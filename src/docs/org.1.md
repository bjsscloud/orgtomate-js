ORG
===

> Org - The Orgtomate CLI for AWS Organizations


## SYNOPSIS

`org <service> <operation> [-c|--constructor-args <key>=<value> ...] [-a|--operation-args <key>=<value> ...] [-j|--args-as-json|--no-j|--no-args-as-json] [-o|--orgtomate <target>] [-y|--recurse|--no-y|--no-recurse] [-r|--regions <region> ...] [-k|--result-key <key>] [-f|--format [flat|full|regions|accountids|accountnames]] [-n|--role-name <role-name>] [-e|--external-id <external-id>] [-s|--duration-seconds <seconds>] [-x|--session-name <session-name>] [-d|--debug|--no-d|--no-debug]`


## DESCRIPTION

Org is a NodeJS command from the the orgtomate package on NPM: [https://www.npmjs.com/package/orgtomate](https://www.npmjs.com/package/orgtomate)

It is an alternative to the AWS Command Line Interface (CLI) for interacting with AWS APIs. It provides the capability to run commands across multiple AWS Accounts and Regions in parallel, while leveraging the speed of asynchronous JavaScript to fun faster than the Python AWS CLI. It is written in TypeScript and distributed as minified (uglified) JavaScript with type definitions and Source Maps. Org makes use of the other libraries in the orgtomate package: _aws-org-node_, _get-aws-results_ and _orgtomate_. _aws-org-node_ provides an Interface and Class for populating a tree structure representing an AWS Organization. _get-aws-results_ provide a standardised automatic paging mechanism for AWS API calls. _orgtomate_ provides the mechanism to run a custom callback in a selection of AWS Accounts in parallel.

Org uses the AWS SDK for JavaScript version 2, and exposes the SDK directly to the user. The services and operations available are stylised exactly as they are in the SDK, and the AWS Service client constructor and operation arguments are expected in the exact format that is expected by the SDK. Therefore rather than the AWS CLI command `aws route53 list-hosted-zones`, in Org you would use `org Route53 listHostedZones` where services are in TitleCase and operations are in camelCase: [https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/)

While Org's execution is designed in general to be fast, some operations may be slow if they require the initialisation of a large AWS Organizations tree. When operations are executed against one account, or all of the accounts in the Organization, Org will determine the list of target accounts on its own. If targeting only a part of an AWS Organization, Org will populate an AwsOrgNode object first, and then use it to determine the list of target accounts. The time taken to populate an AwsOrgNode depends on the size of the Organization or branch of an Organization you are targeting. As a rough estimate this will take 10 seconds for a tree of 200 accounts in a horizontal spread of 50 Organizational Units. Once the list of targets has been determined, the remaining executions will be paralellised across all accounts and regions at once, often returning results across all targets faster than the AWS CLI will return results from one.


## WEBSITE

<https://bjsscloud.github.io/orgtomate-js>


## EXAMPLES

`npm install orgtomate -g`

`org Route53 listHostedZones`

`org Route53 listHostedZones -c MaxRetries=100 -a MaxItems=1 -o Root -k PaginationMetadata -f accountnames`

`org EC2 describeInstances -r eu-west-1 eu-west-2 eu-west-3`

`org EC2 describeInstances -o Root -f full`

`org EC2 describeInstances -o ou-r0123-abcdef01 --no-recurse -r eu-west-1 eu-west-2 -a Filters='[{"Name": "platform", "Values": ["windows"]}]' -j -k Reservations | jq '.Reservations[].Instances[].InstanceId'`


## OPTIONS

*Option Types:*
 * String: A string. May have a default.
 * Number: A string parsed as a number.
 * Boolean: Takes no arguments. Negated by prefixing with `--no-`.
 * Array: Values can be specified space-separated, or with multiple repeat flags, e.g. `-r eu-west-1 eu-west-2` or `-r eu-west-1 -r eu-west-2`.

`<service>`  
	*String :: Required*  
	The AWS API Service Constructor to instantiate, e.g. EC2, Route53, IAM, Organizations, IoT1ClickDevicesService, WellArchitected, ServiceQuotas, Support, ResourceGroupsTaggingAPI

`<operation>`  
	*String :: Required*  
	The Operation to call on the requested Service, e.g. listHostedZones, describeInstances, getAccountPasswordPolicy, listOrganizationalUnits, invokeDeviceMethod, listWorkloads, requestServiceQuotaIncrease, describeTrustedAdvisorChecks, startReportCreation

`-c`, `--constructor-args`  
	*Array :: Optional*  
	Custom arguments to pass to the AWS API Service Constructor, such as exponential backoff parameters. Specified as an Array of key=value pairs. Values may be specified as strings, or optionally as JSON data if combined with `-j|--args-as-json`.

`-a`, `--operation-args`  
	*Array :: Optional*  
	Custom arguments to pass to the AWS API Service Operation, such as resource filters or page size limits. Specified as an Array of key=value pairs. Values may be specified as strings, or optionally as JSON data if combined with `-j|--args-as-json`.

`-j`, `--args-as-json`, `--no-j`, `--no-args-as-json`  
	*Boolean :: Default: false*  
	Whether to parse the values in `-c|--constructor-args` and `-a|--operation-args` arguments as JSON data using `JSON.parse()`

`-o`, `--orgtomate`  
	*String :: Optional*  
	The ID of a node in an AWS Organization, or 'Root' to anonymously reference the Root of the Organization. 
        Options: 'Root' | /^r-[a-z0-9]{4}$/ | /^ou-[a-z0-9]+-[a-z0-9]+$/ | /^[0-9]{12}$/

`-y`, `--recurse`, `--no-y`, `--no-recurse`  
	*Boolean :: Default: true*  
	When specifying a Root or an Organizational Unit target, whether to gather all accounts recursively below the target, or only accounts that are immediate children of the target

`-r`, `--regions`  
	*Array` :: Default: us-east-1*  
        The AWS Regions in which to execute the API call in parallel for every account being targeted, whether just locally or with Orgtomate

`-k`, `--result-key`  
	*String :: Optional*  
        The resultKey to pass to getAwsResults that will reduce the Operation output to only the information required for ease of visualisation and parsing

`-f`, `--format`  
	*String :: Default: flat*  
	The format in which to present the results. Options are: `flat`, `full`, `regions`, `accountids`, `accountnames`.
	 * `flat`: emulates the response you would expect from a single account, with every result from every account and region merged into one result
	 * `full`: returns an Array of objects with results in the `results` key, the execution AWS Region in the `region` key and, when using Orgtomate, the AWS Account Name and AWS Account ID in the `accountName` and `accountId` keys respectively
	 * `regions`: returns an object with one key per execution AWS Region, containing all merged results for that region as the value
	 * `accountids`: returns an object with one key per execution AWS Account ID, containing all merged results for that account as the value
	 * `accountnames`: returns an object with one key per execution AWS Account Name, containing all merged results for that account as the value

`-n`, `--role-name`  
	*String :: Default: OrganizationAccountAccessRole*  
	The name of the AWS IAM Role to assume to access each account targeted by `-o|--orgtomate`

`-e`, `--external-id`  
	*String :: Optional*  
	The value of the External ID string to use when assuming the AWS IAM Role for each account targeted by `-o|--orgtomate`

`-s`, `--duration-seconds`  
	*Number :: Default: 900*  
	The maximum age of the AWS Security Token Service credentials generated when assuming each AWS IAM Role to access each account targeted by `-o|--orgtomate`. These credentials should never live longer than the length of time the operation requires, and therefore, this should almost always be left at the default minimum value of 900.

`-x`, `--session-name`  
	*String :: Default: orgtomate-cli*  
	The value of the Role Session Name string to use when assuming the AWS IAM Role for each account targeted by `-o|--orgtomate`

`-d`, `--debug`, `--no-d`, `--no-debug`  
	*Boolean :: Default: false*  
	Whether to print debug information to STDERR while processing the command


## ENVIRONMENT VARIABLES

The following environment variables will be used as overriding _default_ values for corresponding options. These defaults may still be superceded by passing a value as an argument.

 * `AWS_DEFAULT_REGION` overrides `AWS_REGION` overrides `-r|--region`
 * `ROLE_NAME` overrides `-n|--role-name`
 * `ROLE_EXTERNAL_ID` overrides `-e|--external-id`
 * `ROLE_SESSION_NAME` overrides `-x|--session-name`
 * `ROLE_DURATION_SECONDS` overrides `-s|--duration-seconds`


## BUGS

Please report any bugs at https://github.com/bjsscloud/orgtomate-js/issues


## LICENSE

Copyright (c) 2021, Mike Peachey, BJSS Limited (MIT License).
