#!/usr/bin/env bash
echo './AwsOrgNode.js';
./AwsOrgNode.js >/dev/null || exit 1;
echo './Orgtomate.js';
./Orgtomate.js >/dev/null || exit 1;
echo './Helper.js';
./Helper.js >/dev/null || exit 1;
echo './orgtomateCli.js -s Route53 -o listHostedZones -t Root';
./orgtomateCli.js -s Route53 -o listHostedZones -t Root >/dev/null || exit 1;
echo './orgtomateCli.js -s Route53 -o listHostedZones -p false';
./orgtomateCli.js -s Route53 -o listHostedZones -p false >/dev/null || exit 1;
echo './orgtomateCli.js -s Route53 -o listHostedZones -a MaxItems: 1';
./orgtomateCli.js -s Route53 -o listHostedZones -a MaxItems: 1 >/dev/null || exit 1;
echo './orgtomateCli.js -s Route53 -o listHostedZones -p false -a MaxItems: 1'
./orgtomateCli.js -s Route53 -o listHostedZones -p false -a MaxItems: 1 >/dev/null || exit 1;
