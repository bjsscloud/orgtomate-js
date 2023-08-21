# Orgtomate Change Log

## 1.2.1
*Mon Aug 21 2023*

 * Remove incorrect NPM dependency

## 1.2.0
*Wed Jul 12 2023*

 * Add functionality to specify org client Paramters in the AwsOrgNode class init
 * Add orgtomate parameter to allow Management Account ID to be specified
   so that Orgtomate can assume the defined target role in an alternate
   account in order to perform Organizations queries like listAccounts
 * Add -m/--management-account paramater in the command line accordingly

## 1.1.1
*Thu Oct 06 2022*

 * Update aws-sdk dep to latest. It should never have been locked.

## 1.1.0
*Tue Apr 05 2022*

 * Rewrite suspended account handling, add new example - #3

## 1.0.2
*Mon Apr 04 2022*

 * Improve error reporting and suspended account handling - #1
 * Update dependencies

## 1.0.1
*Thu Aug 26 2021*

 * README.md fixes
 * Creation of CHANGELOG.md

## 1.0.0
*Wed Aug 25 2021*

 * First production release
