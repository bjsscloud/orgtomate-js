#!/usr/bin/env bash
echo 'node dist/aws-org-node.js';
node dist/aws-org-node.js >/dev/null || exit 1;
echo 'node dist/orgtomate.js';
node dist/orgtomate.js >/dev/null || exit 1;
echo 'node dist/paginate.js';
node dist/paginate.js >/dev/null || exit 1;
echo 'node dist/get-aws-results.js';
node dist/paginate.js >/dev/null || exit 1;
echo 'node dist/cli.js -s Route53 -o listHostedZones -t Root';
node dist/cli.js -s Route53 -o listHostedZones -t Root >/dev/null || exit 1;
echo 'node dist/cli.js -s Route53 -o listHostedZones';
node dist/cli.js -s Route53 -o listHostedZones >/dev/null || exit 1;
echo 'node dist/cli.js -s Route53 -o listHostedZones -a MaxItems=1';
node dist/cli.js -s Route53 -o listHostedZones -a MaxItems=1 >/dev/null || exit 1;
