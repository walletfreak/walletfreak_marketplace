'use strict';
const assert=require('node:assert/strict');
global.window={};
require('../plugins/walletfreak/assets/components/v1/components.js');
const {renderTrip}=window.WalletFreakComponents;
const windowDates={check_in:'2027-06-03',check_out:'2027-06-08'};
const target={classList:{add(){}},querySelector(){return null},innerHTML:''};
const show=rows=>{renderTrip(target,rows,windowDates);return target.innerHTML;};
const empty=show([]);
assert.equal((empty.match(/class="wf-needed"/g)||[]).length,5);
assert.match(empty,/Thu<strong>Jun 3<\/strong>/);
assert.match(empty,/Mon<strong>Jun 7<\/strong>/);
const split=show([
  {booking_status:'booked',stay:{check_in:'2027-06-04',check_out:'2027-06-06'}},
  {booking_status:'proposed',title:'Suggested hotel',price:'USD 400',stay:{check_in:'2027-06-06',check_out:'2027-06-08'}}
]);
assert.match(split,/Thu<strong>Jun 3<\/strong>/);
assert.match(split,/Sun<strong>Jun 6<\/strong>/);
assert.match(split,/Mon<strong>Jun 7<\/strong>/);
assert.match(split,/Suggested stay: Suggested hotel/);
assert.doesNotMatch(split,/class="wf-candidate"/);
assert.match(split,/USD 400<small>Stay total/);
assert.equal((split.match(/<span class="wf-price">USD 400/g)||[]).length,1);
assert.equal((split.match(/class="wf-needed"/g)||[]).length,3);
assert.doesNotMatch(show([
  {booking_status:'booked',stay:{check_in:'2027-06-03',check_out:'2027-06-05'}},
  {booking_status:'booked',stay:{check_in:'2027-06-05',check_out:'2027-06-08'}}
]),/class="wf-needed"/);
renderTrip(target,[
  {booking_status:'booked',stay:{check_in:'2027-06-03',check_out:'2027-06-04'}},
  {booking_status:'booked',stay:{check_in:'2027-06-06',check_out:'2027-06-08'}}
]);
assert.equal((target.innerHTML.match(/class="wf-needed"/g)||[]).length,2);
assert.match(target.innerHTML,/Fri<strong>Jun 4<\/strong>/);
assert.match(target.innerHTML,/Sat<strong>Jun 5<\/strong>/);
const flight=show([{day:'2027-06-02',when:'10:35 AM EDT → 2:15 PM JST',title:'Outbound flight',detail:'Booked flight',price:'USD 900',booking_status:'booked'}]);
assert.match(flight,/Outbound flight/);
assert.match(flight,/class="wf-time">10:35 → 2:15/);
assert.match(flight,/10:35 AM EDT → 2:15 PM JST/);
assert.match(flight,/class="wf-price">USD 900/);
assert.match(flight,/Hotel night to book/);
assert.match(flight,/class="wf-info"/);
assert.match(flight,/class="wf-evidence"/);
assert.doesNotMatch(flight,/Details & evidence/);
assert.doesNotMatch(flight,/Payment card: to confirm/);
renderTrip(target,[
  {when:'February 13, 2027 · 18:20 America/New_York',title:'Booked JFK departure',booking_status:'proposed',detail:'Long research note stays in the dialog.'},
  {when:'To confirm',title:'Connection to arrange',detail:'No date supplied.'}
]);
assert.match(target.innerHTML,/Feb 13/);
assert.match(target.innerHTML,/Status to confirm/);
assert.match(target.innerHTML,/Unscheduled/);
assert.doesNotMatch(target.innerHTML,/Date TBD/);
assert.match(target.innerHTML,/Long research note stays in the dialog/);
renderTrip(target,[
  {when:'February 13, 2027',title:'Departure'},
  {when:'February 13, 2027',title:'Arrival'},
  {when:'2027-02-30',title:'Invalid date'}
]);
assert.equal((target.innerHTML.match(/<strong>Feb 13<\/strong>/g)||[]).length,1);
assert.match(target.innerHTML,/Unscheduled/);
let click,opened=0,closed=0;
const dialog={showModal(){opened++},close(){closed++}};
const trip={addEventListener(type,handler){if(type==='click')click=handler},querySelector(){return dialog}};
renderTrip({classList:{add(){}},querySelector(){return trip},innerHTML:''},[{title:'Outbound flight'}]);
click({target:{closest(){return {dataset:{info:'0'},hasAttribute(){return false},classList:{contains(){return false}}}}}});
click({target:{closest(){return {dataset:{},hasAttribute(name){return name==='data-close-info'},closest(){return dialog},classList:{contains(){return false}}}}}});
assert.equal(opened,1);
assert.equal(closed,1);
console.log('hotel slots: OK');
