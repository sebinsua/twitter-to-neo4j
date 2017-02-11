#!/usr/bin/env node

const debug = require('debug')('twitter-to-neo4j:daemon');
const map = require('through2-map');
const tap = require('tap-stream');
const {
  createStreamToDatabase,
  createNodeStatement,
  createRelationshipStatement
} = require('stream-to-neo4j');

const {
  createAmqpStream,
  emitFromStream,
  streams,
  config
} = require('../src');

const parse = map.obj(s => JSON.parse(s));

const toDebugLog = tap(data => debug(data));
const toErrorLog = console.error.bind(console);

const output = process.stdout;

const toTweet = message => {
  const owner = message._context.payload.username;
  const tweet = {
    screenName: message.data.screenName,
    id: message.data.id,
    time: message.data.time,
    text: message.data.text
  };
  return [
    createNodeStatement({ label: 'User', props: { screenName: owner }, idName: 'screenName' }),
    createNodeStatement({ label: 'Tweet', props: tweet, idName: 'id' }),
    createRelationshipStatement({
      left: { label: 'User', id: owner, idName: 'screenName' },
      right: { label: 'Tweet', id: tweet.id, idName: 'id' },
      type: 'TWEETED',
      direction: 'DIRECTION_RIGHT'
    })
  ];
};
const toFinished = () => ({ commit: true });

const streamToDatabase = createStreamToDatabase(
  { url: 'bolt://localhost', username: 'neo4j', password: 'neo4j-password' },
  { tweet: toTweet, finished: toFinished }
);

createAmqpStream(config)
  .then(rpc =>
    streamToDatabase(
      rpc
        .pipe(parse)
        .pipe(emitFromStream(streams))
        .pipe(toDebugLog)
    )
  )
  .catch(toErrorLog);
