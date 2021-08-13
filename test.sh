#!/usr/bin/env bash
echo './aws-org-node.js';
./aws-org-node.js >/dev/null || exit 1;
echo './orgtomate.js';
./orgtomate.js >/dev/null || exit 1;
echo './paginate.js';
./paginate.js >/dev/null || exit 1;
echo './cli.js -s Route53 -o listHostedZones -t Root';
./cli.js -s Route53 -o listHostedZones -t Root >/dev/null || exit 1;
echo './cli.js -s Route53 -o listHostedZones -p false';
./cli.js -s Route53 -o listHostedZones -p false >/dev/null || exit 1;
echo './cli.js -s Route53 -o listHostedZones -a MaxItems: 1';
./cli.js -s Route53 -o listHostedZones -a MaxItems: 1 >/dev/null || exit 1;
echo './cli.js -s Route53 -o listHostedZones -p false -a MaxItems: 1'
./cli.js -s Route53 -o listHostedZones -p false -a MaxItems: 1 >/dev/null || exit 1;
