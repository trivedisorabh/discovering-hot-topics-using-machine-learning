#!/usr/bin/env node
/**********************************************************************************************************************
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                                *
 *                                                                                                                    *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
 *                                                                                                                    *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

import * as events from '@aws-cdk/aws-events';
import * as iam from '@aws-cdk/aws-iam';
import * as kinesis from '@aws-cdk/aws-kinesis';
import * as lambda from '@aws-cdk/aws-lambda';
import * as s3 from '@aws-cdk/aws-s3';
import * as cdk from '@aws-cdk/core';
import { S3ToEventBridgeToLambda } from '../s3-event-notification/s3-eventbridge-lambda';

export class CustomIngestion extends cdk.NestedStack {
    public readonly s3Bucket: s3.Bucket;

    constructor(scope: cdk.Construct, id: string, props: cdk.NestedStackProps) {
        super(scope, id, props);

        const _streamArn = new cdk.CfnParameter(this, 'StreamARN', {
            type: 'String',
            description:
                'The name of the stream where the records from custom ingestion should be published for analysis',
            allowedPattern: '^arn:\\S+:kinesis:\\S+:\\d{12}:stream/\\S+$',
            constraintDescription: 'Please provide the Amazon Kinesis Data Streams name'
        });

        const _accessLoggingBucket = new cdk.CfnParameter(this, 'S3AccessLoggingBucket', {
            type: 'String',
            description: 'The ARN of the access logging bucket that should be used for S3 upload bucket',
            allowedPattern: '^arn:\\S+:s3:\\S+:\\S+:*',
            constraintDescription: 'Please provide a valid ARN for the S3 access logging bucket'
        });

        const _integrationEventBus = new cdk.CfnParameter(this, 'IntegrationBus', {
            type: 'String',
            allowedPattern: '^arn:\\S+:events:\\S+:\\d{12}:event-bus/\\S+$',
            description:
                'The Event Bus to publish metadata information directly for storage and visualization. This metadata information' +
                ' does not process through the workflow engine (e.g. metadata about call analytics processing)'
        });

        const _metadataNS = new cdk.CfnParameter(this, 'MetadataNS', {
            type: 'String',
            constraintDescription: 'Please provide the namespace to used for metadata events published to event bus',
            description:
                'The namespace is used as part of the event pattern to route events to targets on the event bus'
        });

        const _stream = kinesis.Stream.fromStreamArn(this, 'PublishCommentsStream', _streamArn.valueAsString);
        const _loggingBucket = s3.Bucket.fromBucketArn(this, 'AccessLoggingBucket', _accessLoggingBucket.valueAsString);
        const _integrationBus = events.EventBus.fromEventBusArn(
            this,
            'AppIntegrationBus',
            _integrationEventBus.valueAsString
        );

        /*
        The following environment variables for lambda functiona is an example for excel based ingestion.
            let _lambdaEnv = {
                STREAM_NAME: _stream.streamName,
                INTEGRATION_BUS_NAME: _integrationBus.eventBusName,
                ID: "1",
                CREATED_DATE: "2",
                TEXT: "3",
                LANG: "4",
                ACCOUNT_NAME: "xlsx_file",
                PLATFORM: "custom"
            }
        Note the values of ID, CREATED_DATE, TEXT, and LANG are column numbers from which the value will be extracted. A sample excel file is also available
        at this path source/lambda/custom-ingestion/test/fixtures/mock_data_file.xlsx.
        */

        /*
        The following environment variables for lambda function are set up for Amazon Transcribe call analytics based ingestion of data.
        It can be used for any other JSON based ingestion as well. The source/lambda/custom-ingestion/file_processor module defines the available processor 
        types and how they can be invoked through source/lambda/custom-ingestion/file_processor/processor_factory.py
         */
        let _lambdaEnv = {
            STREAM_NAME: _stream.streamName,
            INTEGRATION_BUS_NAME: _integrationBus.eventBusName,
            PROCESSOR_TYPE: 'TRANSCRIBE_CALL_ANALYTICS',
            ID: 'GENERATE',
            CREATED_DATE: 'NOW',
            TEXT: 'Content',
            LANG: 'LanguageCode',
            ACCOUNT_NAME: 'call_analytics',
            SENTIMENT: 'Sentiment',
            NAMESPACE: _metadataNS.valueAsString,
            PLATFORM: 'customingestion',
            LIST_SELECTOR: 'Transcript'
        };

        const _s3ToEventBridgeToLambda = new S3ToEventBridgeToLambda(this, 'CustomIngestion', {
            lambdaFunctionProps: {
                runtime: lambda.Runtime.PYTHON_3_8,
                code: lambda.Code.fromAsset('lambda/ingestion-custom'),
                handler: 'lambda_function.handler',
                environment: _lambdaEnv,
                timeout: cdk.Duration.minutes(15),
                memorySize: 256
            },
            bucketProps: {
                versioned: false
            },
            s3LoggingBucket: _loggingBucket
        });
        this.s3Bucket = _s3ToEventBridgeToLambda.s3Bucket;

        _stream.grantWrite(_s3ToEventBridgeToLambda.lambdaFunction);
        _integrationBus.grantPutEventsTo(_s3ToEventBridgeToLambda.lambdaFunction);

        new iam.Policy(this, 'TagS3Object', {
            document: new iam.PolicyDocument({
                statements: [
                    new iam.PolicyStatement({
                        effect: iam.Effect.ALLOW,
                        actions: ['s3:PutObjectTagging'],
                        resources: [`${_s3ToEventBridgeToLambda.s3Bucket.bucketArn}/*`]
                    })
                ]
            })
        }).attachToRole(_s3ToEventBridgeToLambda.lambdaFunction.role!);

        new cdk.CfnOutput(this, 'S3BucketToUploadData', {
            value: this.s3Bucket.bucketArn,
            description: 'Bucket location to upload source files for ingestion'
        });
    }
}
