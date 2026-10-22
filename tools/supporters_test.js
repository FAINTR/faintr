const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderSupportersPage } = require('./supporters-page');

test('public credits require opt-in, escape names, and exclude private fields', () => {
  const html = renderSupportersPage({supporters:[
    {name:'Private name',publicRecognition:false},
    {name:'Unconfirmed name'},
    {name:'<Approved & name>',publicRecognition:true,email:'never-public@example.invalid',amount:12345},
  ]});
  assert(html.includes('&lt;Approved &amp; name&gt;'));
  for(const value of ['Private name','Unconfirmed name','never-public@example.invalid','12345']) assert(!html.includes(value));
});
test('unpublished Patreon is not a checkout and support URLs cannot become script links', () => {
  assert(!renderSupportersPage().includes('Support on Patreon'));
  assert.throws(()=>renderSupportersPage({patreonUrl:'javascript:alert(1)'}));
  assert.throws(()=>renderSupportersPage({patreonUrl:'https://example.invalid/fake-patreon'}));
  assert(renderSupportersPage({patreonUrl:'https://www.patreon.com/c/FAINTR'}).includes('Support on Patreon'));
});
