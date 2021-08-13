#!/usr/bin/env node
// vim: set syntax=javascript tabstop=2 softtabstop=2 shiftwidth=2 expandtab smarttab :

'use strict';

const AwsOrgNode = require('./aws-org-node');
const { getPaginatedResults, paginate } = require('./paginate');
const orgtomate = require('./orgtomate');

module.exports = {
  AwsOrgNode,
  getPaginatedResults,
  paginate,
  orgtomate,
};
