#!/bin/bash
# Topologia local (LocalStack) só do que este serviço publica e consome.
set -euo pipefail

awslocal sns create-topic --name lagoski-dev-catalog-events >/dev/null
awslocal sns create-topic --name lagoski-dev-ordering-events >/dev/null
awslocal sns create-topic --name lagoski-dev-inventory-events >/dev/null
awslocal sns create-topic --name lagoski-dev-payment-events >/dev/null
awslocal sns create-topic --name lagoski-dev-fulfillment-events >/dev/null
awslocal sqs create-queue --queue-name lagoski-dev-bff-on-catalog-dlq >/dev/null
awslocal sqs create-queue --queue-name lagoski-dev-bff-on-catalog --attributes '{"RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:lagoski-dev-bff-on-catalog-dlq\",\"maxReceiveCount\":\"5\"}"}' >/dev/null
awslocal sns subscribe --topic-arn arn:aws:sns:us-east-1:000000000000:lagoski-dev-catalog-events --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:000000000000:lagoski-dev-bff-on-catalog --attributes '{"RawMessageDelivery":"true"}' >/dev/null
awslocal sqs create-queue --queue-name lagoski-dev-bff-on-ordering-dlq >/dev/null
awslocal sqs create-queue --queue-name lagoski-dev-bff-on-ordering --attributes '{"RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:lagoski-dev-bff-on-ordering-dlq\",\"maxReceiveCount\":\"5\"}"}' >/dev/null
awslocal sns subscribe --topic-arn arn:aws:sns:us-east-1:000000000000:lagoski-dev-ordering-events --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:000000000000:lagoski-dev-bff-on-ordering --attributes '{"RawMessageDelivery":"true"}' >/dev/null
awslocal sqs create-queue --queue-name lagoski-dev-bff-on-inventory-dlq >/dev/null
awslocal sqs create-queue --queue-name lagoski-dev-bff-on-inventory --attributes '{"RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:lagoski-dev-bff-on-inventory-dlq\",\"maxReceiveCount\":\"5\"}"}' >/dev/null
awslocal sns subscribe --topic-arn arn:aws:sns:us-east-1:000000000000:lagoski-dev-inventory-events --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:000000000000:lagoski-dev-bff-on-inventory --attributes '{"RawMessageDelivery":"true"}' >/dev/null
awslocal sqs create-queue --queue-name lagoski-dev-bff-on-payment-dlq >/dev/null
awslocal sqs create-queue --queue-name lagoski-dev-bff-on-payment --attributes '{"RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:lagoski-dev-bff-on-payment-dlq\",\"maxReceiveCount\":\"5\"}"}' >/dev/null
awslocal sns subscribe --topic-arn arn:aws:sns:us-east-1:000000000000:lagoski-dev-payment-events --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:000000000000:lagoski-dev-bff-on-payment --attributes '{"RawMessageDelivery":"true"}' >/dev/null
awslocal sqs create-queue --queue-name lagoski-dev-bff-on-fulfillment-dlq >/dev/null
awslocal sqs create-queue --queue-name lagoski-dev-bff-on-fulfillment --attributes '{"RedrivePolicy":"{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:lagoski-dev-bff-on-fulfillment-dlq\",\"maxReceiveCount\":\"5\"}"}' >/dev/null
awslocal sns subscribe --topic-arn arn:aws:sns:us-east-1:000000000000:lagoski-dev-fulfillment-events --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:000000000000:lagoski-dev-bff-on-fulfillment --attributes '{"RawMessageDelivery":"true"}' >/dev/null
touch /tmp/lagoski-ready
echo "topologia Lagoski pronta"
