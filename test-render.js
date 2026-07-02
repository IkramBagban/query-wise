require('@babel/register')({ presets: ['@babel/preset-env', '@babel/preset-react'] });
const React = require('react');
const ReactDOMServer = require('react-dom/server');
// Mock window/document if needed
global.window = {};
global.document = {};
const { default: FeaturesJourney } = require('./apps/web/components/FeaturesJourney.tsx');
console.log("Renders fine!");
