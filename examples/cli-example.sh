#!/usr/bin/bash

./orgtomateCli.js \
  -s EC2 \
  -o describeInstances \
  -t Root \
  -r eu-west-2,us-east-1,eu-west-1 \
  -f accountnames \
  | jq 'with_entries(
    .value |= [(
      .Reservations[].Instances[]
        | select(.Platform=="windows")
        | select(length>0)
        | {
          InstanceId: .InstanceId,
          Tags: (
            [ .Tags[] | with_entries(.key |= (. | ascii_downcase) ) ]
              | from_entries
          )
        }
    )]
  )
  | with_entries( select( .value | length>0 ) )'
