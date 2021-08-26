#!/usr/bin/env bash
org EC2 describeInstances \
  -o Root \
  -a Filters='[{"Name": "platform", "Values": ["windows"]}]' \
  -j \
  -k Reservations \
  -f accountnames \
  | jq '
    [
      to_entries[] |
      select(.value.Reservations|length>0) |
      .value |= [
        .Reservations[].Instances[] |
        (
          {
            "InstanceId": .InstanceId,
            "InstanceType": .InstanceType,
            "Tags": (
              [ .Tags[] | { (.Key): .Value } ] | add
            )
          }
        )
      ]  
    ] |
    from_entries
  '
