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

import { SynthUtils } from '@aws-cdk/assert';
import * as events from '@aws-cdk/aws-events';
import * as kinesis from '@aws-cdk/aws-kinesis';
import * as cdk from '@aws-cdk/core';
import { RedditIngestion } from '../lib/ingestion/reddit-ingestion';

test('test reddit ingestion stack', () => {
    const stack = new cdk.Stack();
    const _eventBus = new events.EventBus(stack, 'Bus');
    const _stream = new kinesis.Stream(stack, 'Stream', {});

    new RedditIngestion(stack, 'testredditingestion', {
        parameters: {
            RedditAPIKey: '/fakelocation/reddit/comments',
            EventBus: _eventBus.eventBusArn,
            StreamARN: _stream.streamArn,
            RedditIngestionFrequency: 'cron(0/60 * * * ? *)',
            SubRedditsToFollow: 'r/test1,r/test2'
        }
    });

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
});
