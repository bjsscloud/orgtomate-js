#!/usr/bin/env bash
echo 'node dist/aws-org-node.js';
node dist/aws-org-node.js >/dev/null || exit 1;
echo 'node dist/orgtomate.js';
node dist/orgtomate.js >/dev/null || exit 1;
echo 'node dist/paginate.js';
node dist/paginate.js >/dev/null || exit 1;
echo 'node dist/get-aws-results.js';
node dist/paginate.js >/dev/null || exit 1;
echo 'node dist/org.js Route53 listHostedZones -o Root';
node dist/org.js Route53 listHostedZones -o Root >/dev/null || exit 1;
echo 'node dist/org.js Route53 listHostedZones';
node dist/org.js Route53 listHostedZones >/dev/null || exit 1;
echo 'node dist/org.js Route53 listHostedZones -a MaxItems=1';
node dist/org.js Route53 listHostedZones -a MaxItems=1 >/dev/null || exit 1;
