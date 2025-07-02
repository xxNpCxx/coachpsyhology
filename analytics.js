require('dotenv').config();
const fetch = require('node-fetch');

const MIXPANEL_TOKEN = process.env.MIXPANEL_TOKEN;
const MIXPANEL_URL = 'https://api.mixpanel.com/track';
const MIXPANEL_PEOPLE_URL = 'https://api.mixpanel.com/engage';

function trackEvent(userId, eventName, properties = {}) {
  if (!MIXPANEL_TOKEN) {
    console.error('Mixpanel token не найден в .env');
    return;
  }
  const event = {
    event: eventName,
    properties: {
      token: MIXPANEL_TOKEN,
      distinct_id: userId,
      ...properties
    }
  };
  const payload = Buffer.from(JSON.stringify(event)).toString('base64');
  fetch(MIXPANEL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${payload}`
  })
    .then(res => res.text())
    .then(text => {
      if (text !== '1') {
        console.error('Mixpanel не принял событие:', text);
      }
    })
    .catch(err => {
      console.error('Ошибка отправки события в Mixpanel:', err);
    });
}

function setUserOnce(userId, properties = {}) {
  if (!MIXPANEL_TOKEN) {
    console.error('Mixpanel token не найден в .env');
    return;
  }
  const engageEvent = {
    $token: MIXPANEL_TOKEN,
    $distinct_id: userId,
    $set_once: properties
  };
  const payload = Buffer.from(JSON.stringify(engageEvent)).toString('base64');
  fetch(MIXPANEL_PEOPLE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${payload}`
  })
    .then(res => res.text())
    .then(text => {
      if (text !== '1') {
        console.error('Mixpanel people.set_once не принят:', text);
      }
    })
    .catch(err => {
      console.error('Ошибка people.set_once в Mixpanel:', err);
    });
}

module.exports = { trackEvent, setUserOnce }; 