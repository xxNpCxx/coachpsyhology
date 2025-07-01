require('dotenv').config();
const fetch = require('node-fetch');

const MIXPANEL_TOKEN = process.env.MIXPANEL_TOKEN;
const MIXPANEL_URL = 'https://api.mixpanel.com/track';

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

module.exports = { trackEvent }; 